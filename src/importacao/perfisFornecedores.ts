import { parseNumeroFlexivel } from '../numeros'
import { normalizarNcm } from './ncm'
import { normalizarReferencia } from './referencias'
import { normalizarTexto, type LinhaTexto } from './textoPosicionado'

// -----------------------------------------------------------------------
// Como cada fornecedor devolve a cotação. Cada um usa o próprio sistema e o
// documento sempre sai igual — então, reconhecido o fornecedor (CNPJ, nome
// no documento ou nome do arquivo), a leitura segue o padrão dele em vez de
// adivinhar: qual coluna é o nosso código, qual é o preço, onde fica o NCM,
// a marca, a filial que fatura, o que quer dizer "sem estoque".
//
// Padrões (out/2026):
//  - SOLUS (PDF): "Referência" muitas vezes vazia — o código vem no começo
//    da descrição, às vezes com alternativos ("AH216678/H215532"); preço
//    "Unitário Liq." com 3 casas; NCM na coluna "Trib. IPI"; UF da filial no
//    cabeçalho ("SOLUS PECAS AGRICOLAS LTDA - MT").
//  - INGÁ (PDF e print): o nosso código entre parênteses no começo da
//    descrição ("(AH140497) POLIA CENTRAL"); "*" na margem = sem estoque.
//  - CAMBUCI (PDF): código às vezes com espaço ("GE40 KRRB") e variações por
//    marca ("GE40KRRB/1", "/205"); marca depois de "IMP." ("IMP. LODJUR");
//    o total soma o IPI; origem no cabeçalho ("Origem: METALURGICA - SP").
//  - MG PEÇAS / MERTZ E GLAESER e TOLEAGRI (mesmo sistema, Toledo-PR):
//    "Cód. Nosso" = o nosso código, às vezes com a marca colada ("AH170744INA",
//    "JD9268 FAG"); na TOLEAGRI, a coluna "Fil" diz a filial que fatura (PR,
//    SC ou GO) — muda a alíquota de ICMS da compra. O print da MG (tela do
//    pedido) tem as mesmas colunas, sem o ST/DIFAL separado.
//  - MINAS (PDF): o nosso código na coluna "Cód.Original", com a "Marca" do
//    lado; preço sem IPI ("Prc.Unit.").
//  - REDEPARTS (planilha): devolve a nossa própria planilha preenchida; na
//    coluna MARCA, "S/ CADASTRO" ou "S/ ESTOQUE" quer dizer que não tem.
// -----------------------------------------------------------------------

/** Uma linha de item do retorno do fornecedor, antes de casar com os itens da cotação. */
export interface LinhaDoRetorno {
  /** Códigos que o fornecedor escreveu pro item, do mais pro menos confiável (o nosso, alternativos). */
  codigos: string[]
  descricao: string
  quantidade?: number
  valorUnitario?: number
  /** Valor dos produtos (unitário × quantidade), sem IPI/ST. */
  valorTotal?: number
  ncm?: string
  marca?: string
  prazo?: string
  /** UF de onde sai a mercadoria (filial que fatura). */
  uf?: string
  /** O fornecedor marcou que não tem (no momento) — "*" da INGÁ, "S/ ESTOQUE" na planilha… */
  semEstoque?: boolean
  observacao?: string
}

export interface PerfilFornecedor {
  chave: string
  /** Nome como está no cadastro de fornecedores (o que vai pro campo Fornecedor). */
  nome: string
  /** Raiz do CNPJ (8 primeiros dígitos) — identifica qualquer filial. */
  raizesCnpj: string[]
  /** Nome no documento (texto sem acento, maiúsculo). */
  nomeNoDocumento: RegExp
  /** Nome do arquivo (último recurso, quando o documento não diz quem é). */
  nomeDoArquivo: RegExp
  /** O padrão desse fornecedor, em uma frase — aparece na tela de importação. */
  padrao: string
  /** UF de origem quando o documento não diz outra. */
  uf?: string
  /** Lê as linhas de item de PDF/imagem. Sem ele (planilha), vale a leitura de planilha. */
  lerLinhas?: (linhas: LinhaTexto[], textoCompleto: string) => LinhaDoRetorno[]
}

const UNIDADES = 'UN|UND|PC|PÇ|PCS|JG|CJ|KT|KIT|CX|PR|PAR|PCT|MT|KG|LT|L|M|RL|FD|GL|SC'
const NUMERO = /^-?[\d.]*\d(?:,\d+)?%?$/

function numero(texto: string | undefined): number | undefined {
  if (!texto) return undefined
  return parseNumeroFlexivel(texto.replace('%', ''))
}

/** Números de um trecho ("0,00   12,00 3,0000 25,000 29,808") — o que não é número fica de fora. */
function numerosDe(texto: string): number[] {
  return texto
    .split(/\s+/)
    .filter((t) => NUMERO.test(t))
    .map((t) => numero(t))
    .filter((n): n is number => n !== undefined)
}

/** Palavra com cara de código de peça: tem dígito e pelo menos 4 letras/números. */
function pareceCodigo(palavra: string): boolean {
  return /\d/.test(palavra) && normalizarReferencia(palavra).length >= 4
}

function primeiraPalavra(texto: string): string {
  return texto.trim().split(/\s+/)[0] ?? ''
}

/** Unitário que bate com o total (quando o documento tem mais de um preço, ex.: cheio e com desconto). */
function unitarioQueFecha(candidatos: (number | undefined)[], quantidade: number | undefined, total: number | undefined): number | undefined {
  const validos = candidatos.filter((v): v is number => v !== undefined && v > 0)
  if (quantidade && total) {
    const fecha = validos.find((v) => Math.abs(v * quantidade - total) <= Math.max(0.02, total * 0.005))
    if (fecha !== undefined) return fecha
  }
  return validos[0] ?? (quantidade && total ? total / quantidade : undefined)
}

// --- SOLUS -------------------------------------------------------------------------------
const RE_SOLUS = new RegExp(`^\\*?\\s*(\\d{1,3})\\s*\\.?\\s+(\\d{1,6})\\s+(.+?)\\s+(${UNIDADES})\\s+(\\d{8})\\s+(.+)$`)

function lerSolus(linhas: LinhaTexto[], texto: string): LinhaDoRetorno[] {
  const normal = normalizarTexto(texto)
  const uf = normal.match(/SOLUS PECAS AGRICOLAS LTDA\s*-\s*([A-Z]{2})\b/)?.[1]
  const previsao = normal.match(/PREVISAO DE ENTREGA:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1]
  const emissao = normal.match(/EMISSAO:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1]
  const prazo = previsao ? (previsao === emissao ? 'IMEDIATO' : `PREVISÃO ${previsao}`) : undefined
  const resultado: LinhaDoRetorno[] = []
  for (const linha of linhas) {
    const m = linha.texto.match(RE_SOLUS)
    if (!m) continue
    const nums = numerosDe(m[6])
    if (nums.length < 4) continue
    const [quantidade, unitario, , total] = nums.slice(-4)
    // "Referência" (às vezes vazia) e a descrição, que começa pelo código ("HXE111121 CHAPA")
    const segmentos = m[3].split(/\s{3,}/)
    const descricao = segmentos[segmentos.length - 1]
    const codigos = [...(segmentos.length > 1 ? [segmentos[0]] : []), primeiraPalavra(descricao)].filter(pareceCodigo)
    resultado.push({ codigos, descricao, quantidade, valorUnitario: unitario, valorTotal: total, ncm: normalizarNcm(m[5]), uf, prazo })
  }
  return resultado
}

// --- INGÁ --------------------------------------------------------------------------------
// número da linha e NCM opcionais: na foto (OCR) eles às vezes somem — o "(código)" logo depois do
// código da INGÁ já identifica a linha de item
const RE_INGA = new RegExp(`^(\\*\\s*)?(\\d{1,3}\\s+)?([\\d.]{1,10})\\s+\\(([^)]+)\\)\\s*(.*?)\\s+(?:(\\d{8})\\s+)?(${UNIDADES})\\s+(\\d+(?:,\\d+)?)\\s+(.+)$`)

function lerInga(linhas: LinhaTexto[]): LinhaDoRetorno[] {
  const resultado: LinhaDoRetorno[] = []
  let ultima: { item: LinhaDoRetorno; linha: LinhaTexto } | undefined
  for (const linha of linhas) {
    const m = linha.texto.match(RE_INGA)
    if (!m) {
      // "*" na margem, logo abaixo da linha do item (o PDF escreve um pouco mais baixo): sem estoque
      if (ultima && linha.texto.trim().startsWith('*') && linha.y - ultima.linha.y <= ultima.linha.altura * 1.6) ultima.item.semEstoque = true
      continue
    }
    const quantidade = numero(m[8])
    const nums = numerosDe(m[9])
    if (nums.length < 3) continue
    // Pç.Unt, Desc (com desconto), ST, IPI, Aliq.IPI, Prc+Imp, Tot.Item, Tot+Imp
    const total = nums.length >= 8 ? nums[6] : nums[nums.length - 2]
    const unitario = unitarioQueFecha([nums[1], nums[0]], quantidade, total)
    const item: LinhaDoRetorno = {
      codigos: [m[4].trim()],
      descricao: m[5].replace(/\s+\d+\s+(UNIDADES?|PACOTE.*|PCT.*)$/i, '').trim(),
      quantidade,
      valorUnitario: unitario,
      valorTotal: total,
      ncm: m[6] ? normalizarNcm(m[6]) : undefined,
      uf: 'PR',
      ...(m[1] ? { semEstoque: true } : {}),
    }
    resultado.push(item)
    ultima = { item, linha }
  }
  return resultado
}

// --- CAMBUCI -----------------------------------------------------------------------------
const RE_CAMBUCI = /^(\d{4})\s+(.+?)\s+(\d{8})\s+(\d+(?:,\d+)?)\s+(.+)$/

function lerCambuci(linhas: LinhaTexto[], texto: string): LinhaDoRetorno[] {
  const uf = normalizarTexto(texto).match(/ORIGEM:.*?-\s*([A-Z]{2})\b/)?.[1]
  const resultado: LinhaDoRetorno[] = []
  linhas.forEach((linha, i) => {
    const m = linha.texto.match(RE_CAMBUCI)
    if (!m) return
    const nums = numerosDe(m[5])
    if (nums.length < 4) return
    const [unitario, , ipi, totalComIpi] = nums
    // a referência é a primeira coluna — com espaço dentro ("GE40 KRRB") ela vem separada da
    // descrição pelo vão da coluna; colada, é a primeira palavra
    const partes = m[2].split(/\s{3,}/)
    const referencia = partes.length > 1 ? partes[0] : primeiraPalavra(m[2])
    const descricao = (partes.length > 1 ? partes.slice(1).join(' ') : m[2].slice(referencia.length)).trim()
    // a descrição às vezes quebra pra linha de baixo ("IMP. ING")
    const seguinte = linhas[i + 1]?.texto ?? ''
    const continua = !RE_CAMBUCI.test(seguinte) && /^IMP\./.test(seguinte.trim()) ? seguinte.trim() : ''
    const marca = normalizarTexto(`${descricao} ${continua}`).match(/IMP\.\s+([A-Z]{2,})\b/)?.[1]
    const quantidade = numero(m[4])
    resultado.push({
      codigos: [referencia],
      descricao: `${descricao} ${continua}`.trim(),
      quantidade,
      valorUnitario: unitario,
      // o total da CAMBUCI já soma o IPI — o valor dos produtos é sem ele
      valorTotal: totalComIpi !== undefined && ipi !== undefined ? Math.round((totalComIpi - ipi) * 100) / 100 : undefined,
      ncm: normalizarNcm(m[3]),
      marca,
      uf,
      ...(ipi ? { observacao: `IPI R$ ${ipi.toFixed(2).replace('.', ',')}` } : {}),
    })
  })
  return resultado
}

// --- MG PEÇAS (MERTZ E GLAESER) e TOLEAGRI — mesmo sistema ------------------------------
const MARCAS_SEPARADAS = 'GA|INA|PEER|FAG|NSK|SKF|TIMKEN|KOYO|NTN'
const RE_TOLEDO = new RegExp(`^(\\d{1,3})\\s+(\\S+(?:\\s(?:${MARCAS_SEPARADAS}))?)\\s+(.*?)\\s*(\\d{8})((?:\\s+[\\d.,]+){3,})(?:\\s+([A-Z]{2}))?\\s*$`)

/** Linha do sistema de Toledo lida pedaço a pedaço — quando a descrição comprida transborda por cima
 * das colunas de NCM e quantidade ("…F-311" + NCM + "UL-311-200V2" + "2,00" grudados no texto), os
 * pedaços do PDF continuam separados: o NCM é o de 8 dígitos e o que não é número depois dele é
 * descrição que transbordou. */
function sistemaToledoPorTrechos(linha: LinhaTexto): { codigo: string; descricao: string; ncm: string; nums: number[]; uf?: string } | undefined {
  const t = linha.trechos.map((x) => x.texto.trim()).filter(Boolean)
  if (!/^\d{1,3}$/.test(t[0] ?? '') || t.length < 6) return undefined
  const k = t.findIndex((x, i) => i >= 2 && /^\d{8}$/.test(x))
  if (k === -1) return undefined
  const depois = t.slice(k + 1)
  const uf = /^[A-Z]{2}$/.test(depois[depois.length - 1] ?? '') ? depois.pop() : undefined
  const nums = depois.filter((x) => NUMERO.test(x)).map((x) => numero(x)).filter((n): n is number => n !== undefined)
  if (nums.length < 3) return undefined
  const transbordou = depois.filter((x) => !NUMERO.test(x))
  return { codigo: t[1], descricao: [...t.slice(2, k), ...transbordou].join(' '), ncm: t[k], nums, uf }
}

function lerSistemaToledo(ufPadrao: string) {
  return (linhas: LinhaTexto[]): LinhaDoRetorno[] => {
    const resultado: LinhaDoRetorno[] = []
    for (const linha of linhas) {
      const m = linha.texto.match(RE_TOLEDO)
      const lida = m
        ? { codigo: m[2], descricao: m[3].trim(), ncm: m[4], nums: numerosDe(m[5]), uf: m[6] }
        : sistemaToledoPorTrechos(linha)
      if (!lida) continue
      // Qtde, Unitário, Total (+ ST, DIFAL/IPI, Total com impostos no PDF)
      const [quantidade, unitario, total] = lida.nums
      const ipi = lida.nums.length >= 6 ? lida.nums[4] : undefined
      resultado.push({
        codigos: [lida.codigo],
        descricao: lida.descricao,
        quantidade,
        valorUnitario: unitario,
        valorTotal: total,
        ncm: normalizarNcm(lida.ncm),
        uf: lida.uf ?? ufPadrao,
        ...(ipi ? { observacao: `IPI/DIFAL R$ ${ipi.toFixed(2).replace('.', ',')}` } : {}),
      })
    }
    return resultado
  }
}

// --- MINAS -------------------------------------------------------------------------------
const RE_MINAS = /^(\d{1,3})\s+(\d{3,8})\s+(.+?)\s{3,}(\S+)\s{3,}(.+?)\s{3,}(\d{8})\s+(.+)$/
const RE_UNIDADE = new RegExp(`^(${UNIDADES})$`)

function lerMinas(linhas: LinhaTexto[]): LinhaDoRetorno[] {
  const resultado: LinhaDoRetorno[] = []
  for (const linha of linhas) {
    const m = linha.texto.match(RE_MINAS)
    if (!m) continue
    // Kg Total, Un., Quant., Prc.Unit., ST Unit., IPI Unit., Aliq.IPI, Prc+ST+IPI, Tot.Item, Tot+ST+IPI
    const tokens = m[7].split(/\s+/)
    const iUn = tokens.findIndex((t) => RE_UNIDADE.test(t))
    if (iUn === -1) continue
    const quantidade = numero(tokens[iUn + 1])
    const unitario = numero(tokens[iUn + 2])
    const ipiUnit = numero(tokens[iUn + 4])
    const total = numero(tokens[tokens.length - 2])
    resultado.push({
      codigos: [m[4]],
      descricao: m[3].trim(),
      quantidade,
      valorUnitario: unitario,
      valorTotal: total,
      ncm: normalizarNcm(m[6]),
      marca: m[5].trim(),
      uf: 'PR',
      ...(ipiUnit ? { observacao: `IPI R$ ${ipiUnit.toFixed(2).replace('.', ',')}/un` } : {}),
    })
  }
  return resultado
}

export const PERFIS_FORNECEDORES: PerfilFornecedor[] = [
  {
    chave: 'SOLUS',
    nome: 'SOLUS',
    raizesCnpj: ['02149075'],
    nomeNoDocumento: /SOLUS PECAS AGRICOLAS/,
    nomeDoArquivo: /SOLUS/,
    padrao: 'código no começo da descrição (às vezes com alternativos "A/B"), preço com 3 casas, UF da filial no cabeçalho',
    lerLinhas: lerSolus,
  },
  {
    chave: 'INGA',
    nome: 'INGA',
    raizesCnpj: ['11306962'],
    nomeNoDocumento: /INGA INDUSTRIA METALURGICA|INGA PECAS AGRICOLAS/,
    nomeDoArquivo: /INGA/,
    padrao: 'nosso código entre parênteses na descrição; "*" = sem estoque no momento',
    uf: 'PR',
    lerLinhas: lerInga,
  },
  {
    chave: 'CAMBUCI',
    nome: 'CAMBUCI',
    raizesCnpj: ['09454178'],
    nomeNoDocumento: /CAMBUCI METALURGICA/,
    nomeDoArquivo: /CAMBUCI/,
    padrao: 'variações do código por marca ("/1", "/205"), marca depois de "IMP.", total com IPI',
    lerLinhas: lerCambuci,
  },
  {
    chave: 'MG',
    nome: 'MERTZ E GLAESER',
    raizesCnpj: ['00379100'],
    nomeNoDocumento: /MERTZ E GLAESER|MG PECAS AGRICOLAS/,
    nomeDoArquivo: /(^|[^A-Z])MG([^A-Z]|$)|MERTZ/,
    padrao: '"Cód. Nosso" = nosso código, às vezes com a marca colada ("AH170744INA", "JD9268 FAG")',
    uf: 'PR',
    lerLinhas: lerSistemaToledo('PR'),
  },
  {
    chave: 'TOLEAGRI',
    nome: 'TOLEAGRI',
    raizesCnpj: ['05797586'],
    nomeNoDocumento: /TOLEAGRI/,
    nomeDoArquivo: /TOLEAGRI/,
    padrao: '"Cód. Nosso" = nosso código; coluna "Fil" = filial que fatura (PR, SC ou GO)',
    uf: 'PR',
    lerLinhas: lerSistemaToledo('PR'),
  },
  {
    chave: 'MINAS',
    nome: 'MINAS',
    raizesCnpj: ['14090556'],
    nomeNoDocumento: /MINAS DISTRIBUIDORA/,
    nomeDoArquivo: /MINAS/,
    padrao: 'nosso código na coluna "Cód.Original", com a marca ao lado',
    uf: 'PR',
    lerLinhas: lerMinas,
  },
  {
    chave: 'REDEPARTS',
    nome: 'REDEPARTS',
    raizesCnpj: ['04116580'],
    nomeNoDocumento: /REDEPARTS/,
    nomeDoArquivo: /REDEPARTS/,
    padrao: 'a nossa planilha preenchida; MARCA "S/ CADASTRO" ou "S/ ESTOQUE" = não tem',
  },
]

/** O perfil do fornecedor do documento: primeiro pelo CNPJ, depois pelo nome escrito nele, e só
 * então pelo nome do arquivo (o documento manda: um print da MG salvo como "TOLEAGRI.jpeg" é da MG). */
export function identificarPerfil(texto: string, nomeArquivo: string): PerfilFornecedor | undefined {
  const raizes = (texto.match(/\d{2}\.?\d{3}\.?\d{3}\s*\/?\s*\d{4}\s*-?\s*\d{2}/g) ?? []).map((c) => c.replace(/\D/g, '').slice(0, 8))
  const porCnpj = PERFIS_FORNECEDORES.find((p) => p.raizesCnpj.some((raiz) => raizes.includes(raiz)))
  if (porCnpj) return porCnpj
  const normal = normalizarTexto(texto)
  const porNome = PERFIS_FORNECEDORES.find((p) => p.nomeNoDocumento.test(normal))
  if (porNome) return porNome
  const arquivo = normalizarTexto(nomeArquivo)
  return PERFIS_FORNECEDORES.find((p) => p.nomeDoArquivo.test(arquivo))
}

/** O que o fornecedor escreve na coluna de marca (ou de observação) quando não tem o item. */
export function textoDeIndisponivel(texto: string): boolean {
  return /^(S\/?\s*(CADASTRO|ESTOQUE)|SEM (CADASTRO|ESTOQUE)|NAO (TEMOS|TEM|POSSUI)|N\/?\s*TEMOS|EM FALTA|INDISPONIVEL|ZERADO|FORA DE LINHA)\b/.test(
    normalizarTexto(texto),
  )
}
