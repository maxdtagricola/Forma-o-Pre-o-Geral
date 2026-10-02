import * as XLSX from 'xlsx'
import { cellNumero, cellTexto, cellValue, procurarTabelaItens, sheetDims, vazio } from './xlsxSheetUtil'
import { lerPdf } from './importacao/leitorPdf'
import { ocrDeImagem } from './importacao/ocr'
import { agruparEmLinhas, normalizarTexto, type LinhaTexto, type PaginaPosicionada } from './importacao/textoPosicionado'
import { acharReferenciaNaLinha, mesmaReferencia } from './importacao/referencias'
import { acharNcmNasPalavras, documentoMencionaNcm, normalizarNcm } from './importacao/ncm'
import { valoresMonetariosNoTexto } from './numeros'
import type { QuoteItem } from './types'

/** Um item da cotação atual que foi encontrado (pela Referência) no arquivo importado. */
export interface ItemDetectadoFornecedor {
  itemId: string
  referencia: string
  descricao: string
  /** Preço unitário encontrado junto da referência no arquivo — sempre revisável/editável antes de
   * confirmar, nunca aplicado direto: leitura de PDF/planilha variada e OCR de imagem não são 100%
   * confiáveis. */
  valorUnitarioDetectado?: number
  /** Valor total encontrado junto do unitário, quando o arquivo trazia os dois. */
  valorTotalDetectado?: number
  /** true quando unitário × quantidade do item bate com o total encontrado — a leitura "fecha a
   * conta", então é bem provável que esteja certa. */
  conferido?: boolean
  marcaDetectada?: string
  prazoDetectado?: string
  /** NCM que o fornecedor informou pro item (formato 0000.00.00) — fica guardado na cotação dele, e o
   * do fornecedor mais barato vira o NCM do item. */
  ncmDetectado?: string
}

export interface ResultadoImportacaoFornecedor {
  /** Fornecedor já cadastrado que apareceu no arquivo (pelo CNPJ ou pelo nome) — ainda assim
   * precisa de confirmação explícita do usuário, nunca é aplicado sozinho. */
  fornecedorDetectado?: string
  itens: ItemDetectadoFornecedor[]
  /** Preenchido quando o arquivo foi lido (sem erro) mas não achou nada aproveitável — ex.: imagem
   * borrada, PDF escaneado que o OCR não deu conta. */
  avisoLeituraFraca?: string
}

export interface FornecedorConhecido {
  nome: string
  cnpj?: string
}

const EXTENSOES_PLANILHA = ['xlsx', 'xlsm', 'xls', 'csv', 'ods']
const EXTENSOES_IMAGEM = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']

function extensaoDoArquivo(nome: string): string {
  return nome.toLowerCase().split('.').pop() ?? ''
}

/** Fornecedor cadastrado que aparece no texto — primeiro pelo CNPJ (identifica sem ambiguidade),
 * depois pelo nome (o mais comprido que aparecer, pra "TRACTOR TERRA PEÇAS" ganhar de "TRACTOR"). */
function detectarFornecedorConhecido(texto: string, fornecedores: FornecedorConhecido[]): string | undefined {
  const digitos = texto.replace(/\D/g, '')
  for (const f of fornecedores) {
    const cnpj = (f.cnpj ?? '').replace(/\D/g, '')
    if (cnpj.length === 14 && digitos.includes(cnpj)) return f.nome
  }
  const normal = normalizarTexto(texto)
  const porNome = fornecedores
    .filter((f) => {
      const nome = normalizarTexto(f.nome)
      return nome.length >= 3 && new RegExp(`(^|[^A-Z0-9])${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`).test(normal)
    })
    .sort((a, b) => b.nome.length - a.nome.length)
  return porNome[0]?.nome
}

/** Escolhe unitário/total entre os valores de dinheiro achados junto da referência, usando a
 * quantidade do item pra conferir: o par em que unitário × quantidade = total é o certo (mesmo que
 * apareçam outros valores na linha, tipo IPI, desconto ou preço de lista). Sem par que feche a
 * conta, o primeiro valor é o unitário e um seguinte maior ou igual a ele, o total. */
export function escolherUnitarioETotal(
  valores: number[],
  quantidade: number,
): { unitario?: number; total?: number; conferido: boolean } {
  if (valores.length === 0) return { conferido: false }
  const qtd = quantidade > 0 ? quantidade : 1
  for (let i = 0; i < valores.length; i++) {
    for (let j = 0; j < valores.length; j++) {
      if (i === j) continue
      const esperado = valores[i] * qtd
      if (Math.abs(esperado - valores[j]) <= Math.max(0.02, valores[j] * 0.005)) {
        return { unitario: valores[i], total: valores[j], conferido: true }
      }
    }
  }
  // a quantidade às vezes vem escrita como valor ("10,00") antes do preço — não é o unitário
  const candidatos = valores.length >= 2 && quantidade > 0 && valores[0] === quantidade ? valores.slice(1) : valores
  // quantidade 1 (ou um valor só): unitário = total
  if (candidatos.length === 1) return { unitario: candidatos[0], total: qtd === 1 ? candidatos[0] : undefined, conferido: false }
  const [unitario, ...resto] = candidatos
  const total = resto.find((v) => v >= unitario)
  return { unitario, total, conferido: false }
}

const PRAZO_NO_TEXTO = /\b(IMEDIATO|PRONTA ENTREGA|\d{1,3}\s*(?:DIAS?(?:\s+[ÚU]TEIS)?|D\.?U\.?|DD))\b/

/** Acha cada referência dos itens da cotação nas linhas lidas (PDF/OCR) e pega os valores da mesma
 * linha (ou da linha logo abaixo, quando o preço quebrou pra baixo). Só procura pelas referências
 * que já existem na cotação, porque só essas podem virar uma linha no comparador. */
function interpretarLinhas(
  linhas: LinhaTexto[],
  items: QuoteItem[],
  ocr: boolean,
  aceitaNcmSemPontos: boolean,
): ItemDetectadoFornecedor[] {
  const palavrasPorLinha = linhas.map((l) => l.texto.split(/\s+/).filter(Boolean))
  const encontrados: ItemDetectadoFornecedor[] = []
  for (const item of items) {
    const referencia = item.product.referencia.trim()
    if (!referencia) continue
    let achado: ItemDetectadoFornecedor | undefined
    for (let i = 0; i < linhas.length && !achado; i++) {
      const posicao = acharReferenciaNaLinha(palavrasPorLinha[i], referencia, ocr)
      if (!posicao) continue
      // o que vem depois da referência na mesma linha (e, se não tiver preço, a linha de baixo)
      const resto = palavrasPorLinha[i].slice(posicao[1]).join(' ')
      let valores = valoresMonetariosNoTexto(resto)
      if (valores.length === 0 && i + 1 < linhas.length) valores = valoresMonetariosNoTexto(linhas[i + 1].texto)
      const { unitario, total, conferido } = escolherUnitarioETotal(valores, item.product.qtd || 0)
      const prazo = normalizarTexto(resto).match(PRAZO_NO_TEXTO)?.[1]
      // NCM na mesma linha (antes ou depois da referência, menos as palavras da própria referência)
      const ncm = acharNcmNasPalavras(palavrasPorLinha[i], { ignorar: posicao, aceitaSemPontos: aceitaNcmSemPontos, ocr })
      achado = {
        itemId: item.id,
        referencia,
        descricao: item.product.descricao,
        valorUnitarioDetectado: unitario,
        valorTotalDetectado: total,
        conferido,
        ...(prazo ? { prazoDetectado: prazo } : {}),
        ...(ncm ? { ncmDetectado: ncm } : {}),
      }
    }
    if (achado) encontrados.push(achado)
  }
  return encontrados
}

function interpretarPaginas(paginas: PaginaPosicionada[], items: QuoteItem[]): ItemDetectadoFornecedor[] {
  const ocr = paginas.some((p) => p.ocr)
  const linhas = paginas.flatMap((p) => agruparEmLinhas(p.trechos))
  const mencionaNcm = documentoMencionaNcm(linhas.map((l) => l.texto).join('\n'))
  const exatos = interpretarLinhas(linhas, items, false, mencionaNcm)
  if (!ocr) return exatos
  // OCR: tenta de novo, tolerando trocas típicas (O/0, I/1, S/5…), só pros itens que faltaram
  const faltando = items.filter((item) => !exatos.some((e) => e.itemId === item.id))
  return [...exatos, ...interpretarLinhas(linhas, faltando, true, mencionaNcm)]
}

async function importarDePlanilha(
  file: File,
  items: QuoteItem[],
  fornecedores: FornecedorConhecido[],
): Promise<ResultadoImportacaoFornecedor> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  let textoCompleto = ''
  const encontrados = new Map<string, ItemDetectadoFornecedor>()

  for (const nomeAba of workbook.SheetNames) {
    const ws = workbook.Sheets[nomeAba]
    if (!ws) continue
    const { maxRow, maxCol } = sheetDims(ws)
    let textoAba = ''
    for (let r = 1; r <= maxRow; r++) {
      for (let c = 1; c <= maxCol; c++) {
        const v = cellValue(ws, r, c)
        if (!vazio(v)) textoAba += ` ${String(v)}`
      }
    }
    textoCompleto += textoAba
    const abaMencionaNcm = documentoMencionaNcm(textoAba)
    /** NCM numa célula: com os pontos sempre vale; só os 8 dígitos, quando a aba fala em NCM. */
    const ncmDaCelula = (r: number, c: number): string | undefined => {
      const texto = cellTexto(ws, r, c)
      if (!texto) return undefined
      if (!abaMencionaNcm && !/^\d{4}\.\d{2}\.\d{2}$/.test(texto.trim())) return undefined
      return normalizarNcm(texto)
    }

    const tabela = procurarTabelaItens(ws)
    if (tabela && tabela.colReferencia > 0) {
      // planilha com cabeçalho reconhecido: lê cada coluna pelo nome dela
      for (let r = tabela.linhaCabecalho + 1; r <= tabela.maxRow; r++) {
        const referenciaCel = cellTexto(ws, r, tabela.colReferencia)
        if (!referenciaCel) continue
        const item = items.find((i) => i.product.referencia.trim() && mesmaReferencia(i.product.referencia, referenciaCel))
        if (!item || encontrados.has(item.id)) continue
        const unitarioCel = tabela.colVlrUnt > 0 ? cellNumero(ws, r, tabela.colVlrUnt) : undefined
        const totalCel = tabela.colVlrTotal > 0 ? cellNumero(ws, r, tabela.colVlrTotal) : undefined
        const qtd = item.product.qtd || 0
        const conferido =
          unitarioCel !== undefined && totalCel !== undefined && qtd > 0 && Math.abs(unitarioCel * qtd - totalCel) <= Math.max(0.02, totalCel * 0.005)
        const marca = tabela.colMarca > 0 ? cellTexto(ws, r, tabela.colMarca) : ''
        const prazo = tabela.colEntrega > 0 ? cellTexto(ws, r, tabela.colEntrega) : ''
        // coluna com título NCM: os 8 dígitos valem mesmo sem os pontos
        const ncm = tabela.colNcm > 0 ? normalizarNcm(cellTexto(ws, r, tabela.colNcm)) : undefined
        encontrados.set(item.id, {
          itemId: item.id,
          referencia: item.product.referencia,
          descricao: item.product.descricao,
          valorUnitarioDetectado: unitarioCel !== undefined && unitarioCel > 0 ? unitarioCel : undefined,
          valorTotalDetectado: totalCel !== undefined && totalCel > 0 ? totalCel : undefined,
          conferido,
          ...(marca ? { marcaDetectada: marca.toUpperCase() } : {}),
          ...(prazo ? { prazoDetectado: prazo.toUpperCase() } : {}),
          ...(ncm ? { ncmDetectado: ncm } : {}),
        })
      }
    }

    // sem cabeçalho reconhecível (ou referência fora dele): procura cada referência em qualquer
    // célula e pega os números da mesma linha à direita dela
    for (const item of items) {
      if (encontrados.has(item.id) || !item.product.referencia.trim()) continue
      for (let r = 1; r <= maxRow && !encontrados.has(item.id); r++) {
        for (let c = 1; c <= maxCol; c++) {
          const texto = cellTexto(ws, r, c)
          if (!texto || !mesmaReferencia(item.product.referencia, texto)) continue
          let ncm: string | undefined
          for (let c2 = 1; c2 <= maxCol && !ncm; c2++) if (c2 !== c) ncm = ncmDaCelula(r, c2)
          const numeros: number[] = []
          for (let c2 = c + 1; c2 <= maxCol; c2++) {
            // célula que é o NCM (ex.: 84339090 numa célula de número) não é preço — nem um número
            // inteiro de 8 dígitos sem título nenhum: preço de dezenas de milhões não existe aqui
            if (ncmDaCelula(r, c2)) continue
            const bruto = cellValue(ws, r, c2)
            if (typeof bruto === 'number' && Number.isInteger(bruto) && bruto >= 1e7 && bruto < 1e8) continue
            if (typeof bruto === 'number') {
              if (bruto > 0) numeros.push(bruto)
            } else if (typeof bruto === 'string') {
              numeros.push(...valoresMonetariosNoTexto(bruto))
            }
          }
          const { unitario, total, conferido } = escolherUnitarioETotal(numeros, item.product.qtd || 0)
          encontrados.set(item.id, {
            itemId: item.id,
            referencia: item.product.referencia,
            descricao: item.product.descricao,
            valorUnitarioDetectado: unitario,
            valorTotalDetectado: total,
            conferido,
            ...(ncm ? { ncmDetectado: ncm } : {}),
          })
          break
        }
      }
    }
  }

  return {
    fornecedorDetectado: detectarFornecedorConhecido(textoCompleto, fornecedores),
    itens: items.filter((i) => encontrados.has(i.id)).map((i) => encontrados.get(i.id)!),
  }
}

/** Lê um arquivo de cotação de fornecedor (planilha, PDF ou imagem) e casa o que encontrar com os
 * itens já existentes na cotação atual, pela Referência. Nunca aplica nada sozinho — devolve só o
 * que achou, pra revisão e confirmação na tela antes de entrar no comparador. */
export async function importarCotacaoFornecedor(
  file: File,
  items: QuoteItem[],
  fornecedores: FornecedorConhecido[],
): Promise<ResultadoImportacaoFornecedor> {
  const extensao = extensaoDoArquivo(file.name)

  if (EXTENSOES_PLANILHA.includes(extensao)) {
    const resultado = await importarDePlanilha(file, items, fornecedores)
    if (resultado.itens.length === 0) {
      return { ...resultado, avisoLeituraFraca: 'Li a planilha, mas não encontrei nenhuma referência dessa cotação nela.' }
    }
    return resultado
  }

  let paginas: PaginaPosicionada[]
  if (extensao === 'pdf' || file.type.includes('pdf')) {
    paginas = (await lerPdf(file)).paginas
  } else if (EXTENSOES_IMAGEM.includes(extensao) || file.type.startsWith('image/')) {
    paginas = [await ocrDeImagem(file)]
  } else {
    throw new Error('Formato de arquivo não reconhecido — envie uma planilha (.xlsx), PDF ou imagem (.png/.jpg).')
  }

  const texto = paginas.map((p) => p.trechos.map((t) => t.texto).join(' ')).join('\n')
  if (texto.replace(/\s/g, '').length < 10) {
    return { itens: [], avisoLeituraFraca: 'Não consegui ler nenhum texto aproveitável nesse arquivo.' }
  }

  const resultado: ResultadoImportacaoFornecedor = {
    fornecedorDetectado: detectarFornecedorConhecido(texto, fornecedores),
    itens: interpretarPaginas(paginas, items),
  }
  if (resultado.itens.length === 0) {
    resultado.avisoLeituraFraca = 'Li o arquivo, mas não encontrei nenhuma referência dessa cotação nele.'
  } else if (paginas.some((p) => p.ocr)) {
    resultado.avisoLeituraFraca = 'Arquivo lido por imagem (OCR) — confira os valores antes de adicionar.'
  }
  return resultado
}

