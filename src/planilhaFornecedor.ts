import ExcelJS from 'exceljs'
import type { QuoteItem } from './types'

// planilha do fornecedor usa exceljs (não o "xlsx" do resto do app) porque só ele escreve estilo de
// célula de verdade (cor de preenchimento, formato de moeda) — o "xlsx" lê estilo, mas descarta tudo
// ao salvar (limitação conhecida da edição gratuita). Nada aqui mexe nos outros fluxos de planilha
// (planilhaCliente.ts, xlsxSheetUtil.ts), que continuam com o "xlsx".
//
// A planilha é montada inteira em código (título, cabeçalho, cores, formato de moeda), sem carregar
// nenhum arquivo .xlsx externo — assim não existe asset de planilha pra versionar nem regra de
// .gitignore pra abrir exceção. O layout (colunas MARCA/ENTREGA/REFERENCIA/DESCRIÇÃO/QUANT/VLR
// UNT/VLR TOTAL, "COTAR" por linha, total em fórmula) segue o modelo de orçamento que fornecedores
// costumam mandar de volta preenchido — mesma convenção que planilhaCliente.ts já sabe ler.

export interface PlanilhaFornecedorGerada {
  workbook: ExcelJS.Workbook
  htmlPreview: string
}

const FORMATO_MOEDA = '_-"R$"\\ * #,##0.00_-;\\-"R$"\\ * #,##0.00_-;_-"R$"\\ * "-"??_-;_-@_-'
const COR_TITULO = 'FFDDD9C3'
const COR_BORDA = 'FFBFBFBF'
const LARGURA_COLUNAS = [10.86, 10.86, 14.71, 47.14, 6.43, 10.57, 13.71, 10.29]

const COL_MARCA = 1
const COL_ENTREGA = 2
const COL_REFERENCIA = 3
const COL_DESCRICAO = 4
const COL_QUANT = 5
const COL_VLR_UNT = 6
const COL_VLR_TOTAL = 7
const COL_STATUS = 8
const LINHA_TITULO = 1
const LINHA_CABECALHO = 2
const PRIMEIRA_LINHA_ITEM = 3

const bordaFina: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COR_BORDA } },
  left: { style: 'thin', color: { argb: COR_BORDA } },
  bottom: { style: 'thin', color: { argb: COR_BORDA } },
  right: { style: 'thin', color: { argb: COR_BORDA } },
}

/** Monta a planilha de pedido de cotação pro fornecedor com só os itens marcados — preço em branco
 * (pra ele preencher) e o total já em fórmula, recalculando sozinho conforme ele digita. */
export async function gerarPlanilhaFornecedor(items: QuoteItem[]): Promise<PlanilhaFornecedorGerada> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('cotação')
  ws.columns = LARGURA_COLUNAS.map((width) => ({ width }))

  ws.mergeCells(LINHA_TITULO, 1, LINHA_TITULO, COL_VLR_TOTAL)
  const celTitulo = ws.getCell(LINHA_TITULO, 1)
  celTitulo.value = 'ORÇAMENTO'
  celTitulo.font = { bold: true }
  celTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO } }

  const cabecalhos = ['MARCA', 'ENTREGA', 'REFERENCIA', 'DESCRIÇÃO', 'QUANT', 'VLR UNT', 'VLR TOTAL']
  cabecalhos.forEach((texto, i) => {
    const cel = ws.getCell(LINHA_CABECALHO, i + 1)
    cel.value = texto
    cel.font = { bold: true }
    cel.border = bordaFina
  })

  items.forEach((item, i) => {
    const linha = PRIMEIRA_LINHA_ITEM + i

    if (item.product.marca.trim()) ws.getCell(linha, COL_MARCA).value = item.product.marca.trim()
    ws.getCell(linha, COL_REFERENCIA).value = item.product.referencia.trim() || item.product.interno.trim()
    ws.getCell(linha, COL_DESCRICAO).value = item.product.descricao.trim() || item.product.referencia.trim()
    ws.getCell(linha, COL_QUANT).value = item.product.qtd || 0

    const celVlrUnt = ws.getCell(linha, COL_VLR_UNT)
    celVlrUnt.numFmt = FORMATO_MOEDA

    const celVlrTotal = ws.getCell(linha, COL_VLR_TOTAL)
    celVlrTotal.numFmt = FORMATO_MOEDA
    celVlrTotal.value = { formula: `F${linha}*E${linha}` }

    ws.getCell(linha, COL_STATUS).value = 'COTAR'

    for (let c = COL_MARCA; c <= COL_STATUS; c++) ws.getCell(linha, c).border = bordaFina
  })

  const ultimaLinhaItem = PRIMEIRA_LINHA_ITEM + Math.max(items.length, 1) - 1
  const linhaTotal = ultimaLinhaItem + 2 // uma linha em branco antes do total, igual à convenção usual

  ws.mergeCells(linhaTotal, COL_QUANT, linhaTotal, COL_VLR_UNT)
  const celLabelTotal = ws.getCell(linhaTotal, COL_QUANT)
  celLabelTotal.value = 'VALOR TOTAL'
  celLabelTotal.font = { bold: true }

  const celValorTotal = ws.getCell(linhaTotal, COL_VLR_TOTAL)
  celValorTotal.numFmt = FORMATO_MOEDA
  celValorTotal.font = { bold: true }
  celValorTotal.value = { formula: `SUM(G${PRIMEIRA_LINHA_ITEM}:G${ultimaLinhaItem})` }

  return { workbook, htmlPreview: gerarHtmlPreview(ws, linhaTotal, COL_STATUS) }
}

function letraParaColuna(letra: string): number {
  let n = 0
  for (const ch of letra) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function argbParaCss(argb: unknown): string | undefined {
  if (typeof argb !== 'string' || argb.length < 6) return undefined
  const hex = argb.length === 8 ? argb.slice(2) : argb
  return `#${hex}`
}

function estiloCelulaParaCss(cell: ExcelJS.Cell): string {
  const partes: string[] = []
  const fill = cell.fill
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const cor = argbParaCss((fill.fgColor as { argb?: string } | undefined)?.argb)
    if (cor) partes.push(`background-color:${cor}`)
  }
  if (cell.font?.bold) partes.push('font-weight:bold')
  if (cell.font?.size) partes.push(`font-size:${cell.font.size}px`)
  return partes.join(';')
}

function textoExibicaoCelula(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toLocaleDateString('pt-BR')
  if (typeof v === 'object') {
    if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join('')
    if ('formula' in v) {
      const resultado = (v as ExcelJS.CellFormulaValue).result
      return resultado !== undefined && resultado !== null ? String(resultado) : ''
    }
    return ''
  }
  return String(v)
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Prévia HTML da planilha, com as mesmas mesclagens e cores de preenchimento da célula — não é
 * usada pro arquivo final (isso é o workbook do exceljs), só pra mostrar antes de baixar/enviar. */
function gerarHtmlPreview(ws: ExcelJS.Worksheet, ultimaLinha: number, ultimaColuna: number): string {
  const maxRow = Math.min(ws.rowCount, ultimaLinha)
  const maxCol = Math.min(ws.columnCount, ultimaColuna)

  const spanPorOrigem = new Map<string, { colspan: number; rowspan: number }>()
  const coberta = new Set<string>()
  for (const range of ws.model.merges ?? []) {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)
    if (!m) continue
    const [, colLetraIni, linhaIniStr, colLetraFim, linhaFimStr] = m
    const colIni = letraParaColuna(colLetraIni)
    const colFim = letraParaColuna(colLetraFim)
    const linhaIni = Number(linhaIniStr)
    const linhaFim = Number(linhaFimStr)
    spanPorOrigem.set(`${linhaIni},${colIni}`, { colspan: colFim - colIni + 1, rowspan: linhaFim - linhaIni + 1 })
    for (let r = linhaIni; r <= linhaFim; r++) {
      for (let c = colIni; c <= colFim; c++) {
        if (r === linhaIni && c === colIni) continue
        coberta.add(`${r},${c}`)
      }
    }
  }

  const linhasHtml: string[] = []
  for (let r = 1; r <= maxRow; r++) {
    const celulasHtml: string[] = []
    for (let c = 1; c <= maxCol; c++) {
      if (coberta.has(`${r},${c}`)) continue
      const cell = ws.getCell(r, c)
      const span = spanPorOrigem.get(`${r},${c}`)
      const atributos: string[] = []
      if (span && span.colspan > 1) atributos.push(`colspan="${span.colspan}"`)
      if (span && span.rowspan > 1) atributos.push(`rowspan="${span.rowspan}"`)
      const estiloCss = estiloCelulaParaCss(cell)
      if (estiloCss) atributos.push(`style="${estiloCss}"`)
      celulasHtml.push(`<td ${atributos.join(' ')}>${escaparHtml(textoExibicaoCelula(cell))}</td>`)
    }
    linhasHtml.push(`<tr>${celulasHtml.join('')}</tr>`)
  }
  return `<table>${linhasHtml.join('')}</table>`
}

export async function workbookFornecedorParaBlob(workbook: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Nome de arquivo com a máquina/cliente da cotação, igual ao padrão dos arquivos que os
 * fornecedores mandam (ex.: "PLANTADEIRA PC.xlsx") — sem acento/barra, que quebram no Windows. */
export function nomeArquivoFornecedor(maquina: string, cliente: string): string {
  const base = (maquina.trim() || cliente.trim() || 'orcamento')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .trim()
  return `${base}.xlsx`
}
