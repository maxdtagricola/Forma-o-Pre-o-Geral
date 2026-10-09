import * as XLSX from 'xlsx'
import { cellNumero, cellTexto, cellValue, procurarTabelaItens, sheetDims, vazio } from './xlsxSheetUtil'
import { lerPdf } from './importacao/leitorPdf'
import { ocrDeImagem } from './importacao/ocr'
import { agruparEmLinhas, normalizarTexto, type LinhaTexto, type PaginaPosicionada } from './importacao/textoPosicionado'
import { acharReferenciaNaLinha } from './importacao/referencias'
import { acharNcmNasPalavras, documentoMencionaNcm, normalizarNcm } from './importacao/ncm'
import { ORDEM_CASAMENTO, codigoProximo, compararCodigo, type CasamentoCodigo, type TipoCasamento } from './importacao/codigosFornecedor'
import { identificarPerfil, textoDeIndisponivel, type LinhaDoRetorno, type PerfilFornecedor } from './importacao/perfisFornecedores'
import { valoresMonetariosNoTexto } from './numeros'
import type { QuoteItem } from './types'

/** Uma oferta do arquivo importado casada com um item da cotação atual. O mesmo item pode ter mais de
 * uma (o fornecedor ofereceu marcas diferentes: "GE40KRRB" e "GE40KRRB/1"). */
export interface ItemDetectadoFornecedor {
  /** Identifica a oferta (linha do arquivo) — o item da cotação é `itemId`. */
  chave: string
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
  /** Quantidade que o fornecedor disse que atende — coluna de quantidade (ou DISPONÍVEL, ESTOQUE,
   * QTD ATENDIDA…) da planilha; no PDF/foto, a quantidade que fecha unitário × quantidade = total, ou
   * escrita junto ("DISPONÍVEL 2"). Menor que a quantidade do item = ele atende só em parte. */
  quantidadeDetectada?: number
  /** Como o fornecedor escreveu o código, quando não é igual ao nosso. */
  codigoNoArquivo?: string
  /** Quão certo é que é o nosso item (ver codigosFornecedor.ts). */
  casamento: TipoCasamento
  detalheCasamento?: string
  /** O fornecedor marcou que não tem no momento ("*" da INGÁ, "S/ ESTOQUE"…). */
  semEstoque?: boolean
  observacao?: string
  /** UF de onde sai a mercadoria (filial que fatura). */
  ufOrigem?: string
}

/** Linha do arquivo que não casou com nenhum item da cotação. */
export interface LinhaNaoEncontrada {
  codigo: string
  descricao: string
  valorUnitario?: number
}

export interface ResultadoImportacaoFornecedor {
  /** Fornecedor do arquivo (do cadastro, pelo CNPJ ou pelo nome; ou o nome do padrão reconhecido) —
   * ainda assim precisa de confirmação explícita do usuário, nunca é aplicado sozinho. */
  fornecedorDetectado?: string
  /** Padrão de documento reconhecido (ver perfisFornecedores.ts). */
  padrao?: { fornecedor: string; descricao: string }
  itens: ItemDetectadoFornecedor[]
  /** Itens do arquivo que não estão nessa cotação (só quando o padrão do fornecedor é conhecido). */
  naoEncontrados: LinhaNaoEncontrada[]
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

/** Fornecedor cadastrado que aparece no texto — primeiro pelo CNPJ (identifica sem ambiguidade; a
 * raiz de 8 dígitos vale pra qualquer filial), depois pelo nome (o mais comprido que aparecer, pra
 * "TRACTOR TERRA PEÇAS" ganhar de "TRACTOR"). */
function detectarFornecedorConhecido(texto: string, fornecedores: FornecedorConhecido[]): string | undefined {
  const cnpjsNoTexto = (texto.match(/\d{2}\.?\d{3}\.?\d{3}\s*\/?\s*\d{4}\s*-?\s*\d{2}/g) ?? []).map((c) => c.replace(/\D/g, ''))
  for (const f of fornecedores) {
    const cnpj = (f.cnpj ?? '').replace(/\D/g, '')
    if (cnpj.length === 14 && cnpjsNoTexto.includes(cnpj)) return f.nome
  }
  for (const f of fornecedores) {
    const raiz = (f.cnpj ?? '').replace(/\D/g, '').slice(0, 8)
    if (raiz.length === 8 && cnpjsNoTexto.some((c) => c.startsWith(raiz))) return f.nome
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
  /** Quantidades que aparecem na mesma linha — se o fornecedor atende só parte, unitário × uma delas
   * (menor que a pedida) = total, e essa é a quantidade que ele atende. */
  quantidadesNaLinha: number[] = [],
): { unitario?: number; total?: number; conferido: boolean; quantidade?: number } {
  if (valores.length === 0) return { conferido: false }
  const qtd = quantidade > 0 ? quantidade : 1
  const fecha = (unitario: number, vezes: number, total: number) => Math.abs(unitario * vezes - total) <= Math.max(0.02, total * 0.005)
  for (let i = 0; i < valores.length; i++) {
    for (let j = 0; j < valores.length; j++) {
      if (i !== j && fecha(valores[i], qtd, valores[j])) return { unitario: valores[i], total: valores[j], conferido: true }
    }
  }
  for (const parcial of quantidadesNaLinha) {
    if (!(parcial > 0 && parcial < qtd)) continue
    for (let i = 0; i < valores.length; i++) {
      // a própria quantidade escrita como valor ("2,00") não é o unitário
      if (valores[i] === parcial) continue
      for (let j = 0; j < valores.length; j++) {
        if (i !== j && fecha(valores[i], parcial, valores[j])) {
          return { unitario: valores[i], total: valores[j], conferido: true, quantidade: parcial }
        }
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

// quantidade que o fornecedor escreveu que atende ("DISPONÍVEL: 2", "ATENDE 3", "ESTOQUE 1")
const QUANTIDADE_ESCRITA = /\b(?:DISP(?:ONIVE(?:L|IS))?|ATENDE(?:MOS)?|ATENDIDA|SALDO|ESTOQUE)\.?\s*:?\s*(\d{1,5})(?:,00)?\b/

/** Números inteiros soltos no texto ("2", "2,00", "3 UN") — candidatos a quantidade. */
function quantidadesNoTexto(texto: string): number[] {
  return (texto.match(/(?<![\d.,])\d{1,5}(?:,00)?(?![\d.,])/g) ?? []).map((m) => Number(m.replace(',00', ''))).filter((n) => n > 0)
}

/** Unitário × quantidade dá o total? (com uma folga de arredondamento) */
function fechaConta(unitario: number | undefined, quantidade: number | undefined, total: number | undefined): boolean {
  return (
    unitario !== undefined &&
    total !== undefined &&
    quantidade !== undefined &&
    quantidade > 0 &&
    Math.abs(unitario * quantidade - total) <= Math.max(0.02, total * 0.005)
  )
}

/** Onde a referência aparece numa linha com o código escrito do jeito do fornecedor (marca colada,
 * sufixo, alternativos) — só pra quando ela não aparece igual. */
function acharVariacaoNaLinha(palavras: string[], referencia: string): { posicao: [number, number]; casamento: CasamentoCodigo; codigo: string } | undefined {
  for (let i = 0; i < palavras.length; i++) {
    // a palavra sozinha e com a seguinte ("JD9268 FAG")
    for (let j = i; j < Math.min(palavras.length, i + 2); j++) {
      const codigo = palavras.slice(i, j + 1).join(' ').replace(/^[(]+|[)]+$/g, '')
      const casamento = compararCodigo(referencia, codigo)
      if (casamento && casamento.tipo !== 'exato') return { posicao: [i, j + 1], casamento, codigo }
    }
  }
  return undefined
}

/** Leitura genérica (fornecedor de padrão desconhecido): acha cada referência dos itens da cotação
 * nas linhas lidas (PDF/OCR) e pega os valores da mesma linha (ou da linha logo abaixo, quando o preço
 * quebrou pra baixo). Só procura pelas referências que já existem na cotação, porque só essas podem
 * virar uma linha no comparador. */
function interpretarLinhas(
  linhas: LinhaTexto[],
  items: QuoteItem[],
  ocr: boolean,
  aceitaNcmSemPontos: boolean,
  aceitaVariacao: boolean,
): ItemDetectadoFornecedor[] {
  const palavrasPorLinha = linhas.map((l) => l.texto.split(/\s+/).filter(Boolean))
  const encontrados: ItemDetectadoFornecedor[] = []
  for (const item of items) {
    const referencia = item.product.referencia.trim()
    if (!referencia) continue
    let achado: ItemDetectadoFornecedor | undefined
    for (let i = 0; i < linhas.length && !achado; i++) {
      const exata = acharReferenciaNaLinha(palavrasPorLinha[i], referencia, ocr)
      const variacao = !exata && aceitaVariacao ? acharVariacaoNaLinha(palavrasPorLinha[i], referencia) : undefined
      const posicao = exata ?? variacao?.posicao
      if (!posicao) continue
      // o que vem depois da referência na mesma linha (e, se não tiver preço, a linha de baixo)
      const resto = palavrasPorLinha[i].slice(posicao[1]).join(' ')
      let textoDosValores = resto
      let valores = valoresMonetariosNoTexto(resto)
      if (valores.length === 0 && i + 1 < linhas.length) {
        textoDosValores = linhas[i + 1].texto
        valores = valoresMonetariosNoTexto(textoDosValores)
      }
      const { unitario, total, conferido, quantidade } = escolherUnitarioETotal(
        valores,
        item.product.qtd || 0,
        quantidadesNoTexto(textoDosValores),
      )
      const escrita = normalizarTexto(`${resto} ${textoDosValores}`).match(QUANTIDADE_ESCRITA)?.[1]
      const quantidadeDetectada = escrita !== undefined ? Number(escrita) : quantidade
      const prazo = normalizarTexto(resto).match(PRAZO_NO_TEXTO)?.[1]
      // NCM na mesma linha (antes ou depois da referência, menos as palavras da própria referência)
      const ncm = acharNcmNasPalavras(palavrasPorLinha[i], { ignorar: posicao, aceitaSemPontos: aceitaNcmSemPontos, ocr })
      achado = {
        chave: item.id,
        itemId: item.id,
        referencia,
        descricao: item.product.descricao,
        valorUnitarioDetectado: unitario,
        valorTotalDetectado: total,
        conferido,
        casamento: variacao ? variacao.casamento.tipo : 'exato',
        ...(variacao
          ? {
              codigoNoArquivo: variacao.codigo,
              detalheCasamento: variacao.casamento.detalhe,
              ...(variacao.casamento.marca ? { marcaDetectada: variacao.casamento.marca } : {}),
            }
          : {}),
        ...(prazo ? { prazoDetectado: prazo } : {}),
        ...(ncm ? { ncmDetectado: ncm } : {}),
        ...(quantidadeDetectada !== undefined ? { quantidadeDetectada } : {}),
      }
    }
    if (achado) encontrados.push(achado)
  }
  return encontrados
}

function interpretarPaginas(linhas: LinhaTexto[], items: QuoteItem[], ocr: boolean): ItemDetectadoFornecedor[] {
  const mencionaNcm = documentoMencionaNcm(linhas.map((l) => l.texto).join('\n'))
  const exatos = interpretarLinhas(linhas, items, false, mencionaNcm, true)
  if (!ocr) return exatos
  // OCR: tenta de novo, tolerando trocas típicas (O/0, I/1, S/5…), só pros itens que faltaram
  const faltando = items.filter((item) => !exatos.some((e) => e.itemId === item.id))
  return [...exatos, ...interpretarLinhas(linhas, faltando, true, mencionaNcm, false)]
}

/** O item da cotação de uma linha do retorno: o primeiro código dela que casar (na ordem em que o
 * fornecedor escreveu), com o item que casar melhor. */
function melhorItemDaLinha(
  linha: LinhaDoRetorno,
  items: QuoteItem[],
  ocr: boolean,
): { item: QuoteItem; casamento: CasamentoCodigo; codigo: string } | undefined {
  for (const codigo of linha.codigos) {
    for (const tolerante of ocr ? [false, true] : [false]) {
      let melhor: { item: QuoteItem; casamento: CasamentoCodigo; codigo: string } | undefined
      for (const item of items) {
        const referencia = item.product.referencia.trim()
        if (!referencia) continue
        const casamento = compararCodigo(referencia, codigo, tolerante)
        if (casamento && (!melhor || ORDEM_CASAMENTO[casamento.tipo] < ORDEM_CASAMENTO[melhor.casamento.tipo])) {
          melhor = { item, casamento, codigo }
        }
      }
      if (melhor) return melhor
    }
  }
  return undefined
}

/** Casa as linhas lidas no padrão do fornecedor com os itens da cotação. Código um caractere diferente
 * só vira sugestão (desmarcada) e só pra item que não achou nada melhor no arquivo. */
export function casarLinhasDoRetorno(
  linhas: LinhaDoRetorno[],
  items: QuoteItem[],
  ocr: boolean,
): { itens: ItemDetectadoFornecedor[]; naoEncontrados: LinhaNaoEncontrada[] } {
  const casadas = linhas.map((linha) => ({ linha, achado: melhorItemDaLinha(linha, items, ocr) }))
  const itensComOferta = new Set(casadas.filter((c) => c.achado).map((c) => c.achado!.item.id))
  for (const c of casadas) {
    if (c.achado) continue
    const candidatos = items.flatMap((item) => {
      if (itensComOferta.has(item.id) || !item.product.referencia.trim()) return []
      const codigo = c.linha.codigos[0] ?? ''
      const casamento = codigo ? codigoProximo(item.product.referencia, codigo) : undefined
      return casamento ? [{ item, casamento, codigo }] : []
    })
    // dois itens a um caractere de distância: não dá pra saber qual — fica de fora
    if (candidatos.length === 1) c.achado = candidatos[0]
  }

  const itens: ItemDetectadoFornecedor[] = []
  const naoEncontrados: LinhaNaoEncontrada[] = []
  casadas.forEach(({ linha, achado }, i) => {
    if (!achado) {
      naoEncontrados.push({ codigo: linha.codigos.join(' / '), descricao: linha.descricao, valorUnitario: linha.valorUnitario })
      return
    }
    const { item, casamento, codigo } = achado
    const unitario = linha.valorUnitario ?? (linha.valorTotal && linha.quantidade ? linha.valorTotal / linha.quantidade : undefined)
    const total = linha.valorTotal ?? (unitario !== undefined && linha.quantidade ? unitario * linha.quantidade : undefined)
    const quantidade = linha.semEstoque ? 0 : linha.quantidade
    const marca = linha.marca || casamento.marca
    const prazo = linha.semEstoque ? 'SEM ESTOQUE' : linha.prazo
    itens.push({
      chave: `${item.id}#${i}`,
      itemId: item.id,
      referencia: item.product.referencia,
      descricao: item.product.descricao || linha.descricao,
      valorUnitarioDetectado: unitario !== undefined && unitario > 0 ? unitario : undefined,
      valorTotalDetectado: total !== undefined && total > 0 ? total : undefined,
      conferido: fechaConta(unitario, item.product.qtd || 0, total) || fechaConta(unitario, linha.quantidade, total),
      casamento: casamento.tipo,
      ...(casamento.tipo !== 'exato' ? { codigoNoArquivo: codigo, detalheCasamento: casamento.detalhe } : {}),
      ...(marca ? { marcaDetectada: marca.toUpperCase() } : {}),
      ...(prazo ? { prazoDetectado: prazo.toUpperCase() } : {}),
      ...(linha.ncm ? { ncmDetectado: linha.ncm } : {}),
      ...(quantidade !== undefined ? { quantidadeDetectada: quantidade } : {}),
      ...(linha.semEstoque ? { semEstoque: true } : {}),
      ...(linha.observacao ? { observacao: linha.observacao } : {}),
      ...(linha.uf ? { ufOrigem: linha.uf } : {}),
    })
  })
  return { itens, naoEncontrados }
}

async function importarDePlanilha(
  file: File,
  items: QuoteItem[],
  fornecedores: FornecedorConhecido[],
): Promise<ResultadoImportacaoFornecedor> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  let textoCompleto = ''
  const encontrados: ItemDetectadoFornecedor[] = []
  const naoEncontrados: LinhaNaoEncontrada[] = []
  const temOferta = (itemId: string) => encontrados.some((e) => e.itemId === itemId)

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
      // planilha com cabeçalho reconhecido: lê cada coluna pelo nome dela — cada linha vira uma
      // oferta do item que o código dela casar (com o código do jeito do fornecedor: "6210523M1",
      // "ACW2132720/1"…)
      for (let r = tabela.linhaCabecalho + 1; r <= tabela.maxRow; r++) {
        const referenciaCel = cellTexto(ws, r, tabela.colReferencia)
        if (!referenciaCel) continue
        const descricaoCel = tabela.colDescricao > 0 ? cellTexto(ws, r, tabela.colDescricao) : ''
        const unitarioCel = tabela.colVlrUnt > 0 ? cellNumero(ws, r, tabela.colVlrUnt) : undefined
        const linhaRetorno: LinhaDoRetorno = { codigos: [referenciaCel], descricao: descricaoCel, valorUnitario: unitarioCel }
        const achado = melhorItemDaLinha(linhaRetorno, items, false)
        if (!achado) {
          naoEncontrados.push({ codigo: referenciaCel, descricao: descricaoCel, valorUnitario: unitarioCel })
          continue
        }
        const { item, casamento } = achado
        const totalCel = tabela.colVlrTotal > 0 ? cellNumero(ws, r, tabela.colVlrTotal) : undefined
        const qtd = item.product.qtd || 0
        // quantidade que o fornecedor atende: a coluna DISPONÍVEL/ESTOQUE/QTD ATENDIDA, se tiver; senão
        // a coluna de quantidade da cotação dele (pode vir menor que a nossa)
        const disponivelCel = tabela.colQuantDisponivel > 0 ? cellNumero(ws, r, tabela.colQuantDisponivel) : undefined
        const quantCel = tabela.colQuant > 0 ? cellNumero(ws, r, tabela.colQuant) : undefined
        const marcaCel = tabela.colMarca > 0 ? cellTexto(ws, r, tabela.colMarca) : ''
        const obsCel = tabela.colObservacao > 0 ? cellTexto(ws, r, tabela.colObservacao) : ''
        // "S/ CADASTRO", "S/ ESTOQUE" na coluna de marca (ou na de observação): o fornecedor não tem
        const semEstoque = textoDeIndisponivel(marcaCel) || textoDeIndisponivel(obsCel)
        const quantidade = semEstoque ? 0 : [disponivelCel, quantCel].find((q) => q !== undefined && q >= 0)
        const conferido = fechaConta(unitarioCel, qtd, totalCel) || fechaConta(unitarioCel, quantidade, totalCel)
        const marca = textoDeIndisponivel(marcaCel) ? casamento.marca : marcaCel || casamento.marca
        const prazo = semEstoque ? (textoDeIndisponivel(marcaCel) ? marcaCel : obsCel) : tabela.colEntrega > 0 ? cellTexto(ws, r, tabela.colEntrega) : ''
        // coluna com título NCM: os 8 dígitos valem mesmo sem os pontos
        const ncm = tabela.colNcm > 0 ? normalizarNcm(cellTexto(ws, r, tabela.colNcm)) : undefined
        encontrados.push({
          chave: `${item.id}#${nomeAba}!${r}`,
          itemId: item.id,
          referencia: item.product.referencia,
          descricao: item.product.descricao,
          valorUnitarioDetectado: unitarioCel !== undefined && unitarioCel > 0 ? unitarioCel : undefined,
          valorTotalDetectado: totalCel !== undefined && totalCel > 0 ? totalCel : undefined,
          conferido,
          casamento: casamento.tipo,
          ...(casamento.tipo !== 'exato' ? { codigoNoArquivo: referenciaCel, detalheCasamento: casamento.detalhe } : {}),
          ...(marca ? { marcaDetectada: marca.toUpperCase() } : {}),
          ...(prazo ? { prazoDetectado: prazo.toUpperCase() } : {}),
          ...(ncm ? { ncmDetectado: ncm } : {}),
          ...(quantidade !== undefined ? { quantidadeDetectada: quantidade } : {}),
          ...(semEstoque ? { semEstoque: true } : {}),
          ...(obsCel && !textoDeIndisponivel(obsCel) ? { observacao: obsCel.toUpperCase() } : {}),
        })
      }
    }

    // sem cabeçalho reconhecível (ou referência fora dele): procura cada referência em qualquer
    // célula e pega os números da mesma linha à direita dela
    for (const item of items) {
      if (temOferta(item.id) || !item.product.referencia.trim()) continue
      let achou = false
      for (let r = 1; r <= maxRow && !achou; r++) {
        for (let c = 1; c <= maxCol; c++) {
          const texto = cellTexto(ws, r, c)
          const casamento = texto ? compararCodigo(item.product.referencia, texto) : undefined
          if (!casamento || casamento.tipo === 'proximo') continue
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
          const { unitario, total, conferido, quantidade } = escolherUnitarioETotal(
            numeros,
            item.product.qtd || 0,
            numeros.filter((n) => Number.isInteger(n)),
          )
          encontrados.push({
            chave: item.id,
            itemId: item.id,
            referencia: item.product.referencia,
            descricao: item.product.descricao,
            valorUnitarioDetectado: unitario,
            valorTotalDetectado: total,
            conferido,
            casamento: casamento.tipo,
            ...(casamento.tipo !== 'exato' ? { codigoNoArquivo: texto, detalheCasamento: casamento.detalhe } : {}),
            ...(casamento.marca ? { marcaDetectada: casamento.marca } : {}),
            ...(ncm ? { ncmDetectado: ncm } : {}),
            ...(quantidade !== undefined ? { quantidadeDetectada: quantidade } : {}),
          })
          achou = true
          break
        }
      }
    }
  }

  const perfil = identificarPerfil(textoCompleto, file.name)
  return {
    fornecedorDetectado: detectarFornecedorConhecido(textoCompleto, fornecedores) ?? perfil?.nome,
    ...(perfil ? { padrao: { fornecedor: perfil.nome, descricao: perfil.padrao } } : {}),
    itens: ordenarComoNaCotacao(encontrados, items),
    naoEncontrados,
  }
}

/** Ofertas na ordem dos itens da cotação (e, do mesmo item, na ordem do arquivo). */
function ordenarComoNaCotacao(itens: ItemDetectadoFornecedor[], items: QuoteItem[]): ItemDetectadoFornecedor[] {
  const posicao = new Map(items.map((item, i) => [item.id, i]))
  return itens
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (posicao.get(a.item.itemId) ?? 0) - (posicao.get(b.item.itemId) ?? 0) || a.i - b.i)
    .map((x) => x.item)
}

/** Lê o documento no padrão do fornecedor reconhecido; se o padrão não render nada (ex.: foto que o
 * OCR leu torto), volta pra leitura genérica. Na foto, o que o padrão não pegou ainda é procurado do
 * jeito genérico. */
function lerPaginas(
  paginas: PaginaPosicionada[],
  items: QuoteItem[],
  perfil: PerfilFornecedor | undefined,
  texto: string,
): { itens: ItemDetectadoFornecedor[]; naoEncontrados: LinhaNaoEncontrada[]; leuNoPadrao: boolean } {
  const ocr = paginas.some((p) => p.ocr)
  const linhas = paginas.flatMap((p) => agruparEmLinhas(p.trechos))
  const doPadrao = perfil?.lerLinhas?.(linhas, texto) ?? []
  if (doPadrao.length === 0) return { itens: interpretarPaginas(linhas, items, ocr), naoEncontrados: [], leuNoPadrao: false }
  const casado = casarLinhasDoRetorno(doPadrao, items, ocr)
  if (!ocr) return { ...casado, leuNoPadrao: true }
  const faltando = items.filter((item) => !casado.itens.some((e) => e.itemId === item.id))
  const genericos = interpretarPaginas(linhas, faltando, ocr)
  return { itens: [...casado.itens, ...genericos], naoEncontrados: casado.naoEncontrados, leuNoPadrao: true }
}

/** Lê um arquivo de cotação de fornecedor (planilha, PDF ou imagem) e casa o que encontrar com os
 * itens já existentes na cotação atual, pela Referência (no padrão do fornecedor, quando ele é
 * conhecido — ver perfisFornecedores.ts). Nunca aplica nada sozinho — devolve só o que achou, pra
 * revisão e confirmação na tela antes de entrar no comparador. */
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
    return { itens: [], naoEncontrados: [], avisoLeituraFraca: 'Não consegui ler nenhum texto aproveitável nesse arquivo.' }
  }

  const perfil = identificarPerfil(texto, file.name)
  const { itens, naoEncontrados, leuNoPadrao } = lerPaginas(paginas, items, perfil, texto)
  const resultado: ResultadoImportacaoFornecedor = {
    fornecedorDetectado: detectarFornecedorConhecido(texto, fornecedores) ?? perfil?.nome,
    ...(perfil && leuNoPadrao ? { padrao: { fornecedor: perfil.nome, descricao: perfil.padrao } } : {}),
    itens: ordenarComoNaCotacao(itens, items),
    naoEncontrados,
  }
  if (resultado.itens.length === 0) {
    resultado.avisoLeituraFraca = 'Li o arquivo, mas não encontrei nenhuma referência dessa cotação nele.'
  } else if (paginas.some((p) => p.ocr)) {
    resultado.avisoLeituraFraca = 'Arquivo lido por imagem (OCR) — confira os valores antes de adicionar.'
  }
  return resultado
}
