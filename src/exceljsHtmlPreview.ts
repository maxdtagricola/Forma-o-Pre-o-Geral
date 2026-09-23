import type ExcelJS from 'exceljs'

// prévia HTML de uma planilha exceljs (mesclagens, cor de preenchimento, borda) — compartilhada
// entre planilhaFornecedor.ts e planilhaPedidoCompra.ts, os dois com o mesmo padrão de "monta tudo
// em código, mostra uma prévia fiel antes de baixar/enviar".

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

function bordaParaCss(lado: 'top' | 'bottom' | 'left' | 'right', border: Partial<ExcelJS.Borders> | undefined): string | undefined {
  const aresta = border?.[lado]
  if (!aresta || !aresta.style) return undefined
  const cor = argbParaCss((aresta.color as { argb?: string } | undefined)?.argb) ?? '#000'
  return `border-${lado}:1px solid ${cor}`
}

function estiloCelulaParaCss(cell: ExcelJS.Cell): string {
  const partes: string[] = []
  const fill = cell.fill
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const cor = argbParaCss((fill.fgColor as { argb?: string } | undefined)?.argb)
    if (cor) partes.push(`background-color:${cor}`)
  }
  if (cell.font?.bold) partes.push('font-weight:bold')
  if (cell.font?.italic) partes.push('font-style:italic')
  if (cell.font?.size) partes.push(`font-size:${cell.font.size}px`)
  if (cell.font?.color && 'argb' in cell.font.color) {
    const cor = argbParaCss(cell.font.color.argb)
    if (cor) partes.push(`color:${cor}`)
  }
  const bordas = cell.border
  if (bordas) {
    for (const lado of ['top', 'bottom', 'left', 'right'] as const) {
      const css = bordaParaCss(lado, bordas)
      if (css) partes.push(css)
    }
  }
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

/** Prévia HTML de uma planilha exceljs, com as mesmas mesclagens, cores e bordas da célula — não é
 * usada pro arquivo final (isso é o workbook do exceljs), só pra mostrar antes de baixar/enviar.
 * Corta em `ultimaLinha`/`ultimaColuna` pra não arrastar linhas/colunas em branco só formatadas. */
export function gerarHtmlPreview(ws: ExcelJS.Worksheet, ultimaLinha: number, ultimaColuna: number): string {
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

export async function workbookParaBlobXlsx(workbook: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
