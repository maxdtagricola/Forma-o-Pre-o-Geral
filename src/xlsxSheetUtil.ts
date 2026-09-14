import * as XLSX from 'xlsx'

export function cellValue(ws: XLSX.WorkSheet, row: number, col: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
  const cell = ws[addr]
  return cell ? cell.v : undefined
}

export function setCellValue(ws: XLSX.WorkSheet, row: number, col: number, value: string | number): void {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
  ws[addr] = typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: value }
}

export function clearCellValue(ws: XLSX.WorkSheet, row: number, col: number): void {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
  delete ws[addr]
}

export function sheetDims(ws: XLSX.WorkSheet): { maxRow: number; maxCol: number } {
  const ref = ws['!ref']
  if (!ref) return { maxRow: 0, maxCol: 0 }
  const range = XLSX.utils.decode_range(ref)
  return { maxRow: range.e.r + 1, maxCol: range.e.c + 1 }
}

export function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

export function vazio(valor: unknown): boolean {
  return valor === undefined || valor === null || String(valor).trim() === ''
}

export interface TabelaItensLocalizada {
  linhaCabecalho: number
  colReferencia: number
  colDescricao: number
  colQuant: number
  colEntrega: number
  colVlrUnt: number
  colVlrTotal: number
  maxRow: number
  maxCol: number
}

/**
 * Localiza a tabela de itens de uma planilha de orçamento (modelo
 * MARCA/ENTREGA/REFERENCIA/DESCRIÇÃO/QUANT/VLR UNT/VLR TOTAL): acha a linha
 * de cabeçalho pela célula "REFERENCIA" e mapeia as demais colunas a partir
 * dela, pra não depender de posição fixa.
 */
export function localizarTabelaItens(ws: XLSX.WorkSheet): TabelaItensLocalizada {
  const { maxRow, maxCol } = sheetDims(ws)

  let linhaCabecalho = -1
  let colReferencia = -1
  for (let r = 1; r <= maxRow && linhaCabecalho === -1; r++) {
    for (let c = 1; c <= maxCol; c++) {
      if (normalizar(cellValue(ws, r, c)) === 'referencia') {
        linhaCabecalho = r
        colReferencia = c
        break
      }
    }
  }
  if (linhaCabecalho === -1) {
    throw new Error('Não encontrei a tabela de itens (coluna "REFERENCIA") nessa planilha.')
  }

  let colDescricao = -1
  let colQuant = -1
  let colEntrega = -1
  let colVlrUnt = -1
  let colVlrTotal = -1
  for (let c = 1; c <= maxCol; c++) {
    const texto = normalizar(cellValue(ws, linhaCabecalho, c))
    if (texto.startsWith('descri')) colDescricao = c
    else if (texto.startsWith('quant')) colQuant = c
    else if (texto === 'entrega') colEntrega = c
    else if (texto.startsWith('vlr unt') || texto.startsWith('valor unt')) colVlrUnt = c
    else if (texto.startsWith('vlr total') || texto.startsWith('valor total')) colVlrTotal = c
  }
  if (colDescricao === -1 || colQuant === -1) {
    throw new Error('Não encontrei as colunas de descrição e quantidade na tabela de itens.')
  }

  return { linhaCabecalho, colReferencia, colDescricao, colQuant, colEntrega, colVlrUnt, colVlrTotal, maxRow, maxCol }
}

export interface PreviaPlanilha {
  htmlPreview: string
  nomeAba: string
  totalLinhas: number
  linhasMostradas: number
}

/**
 * Prévia bruta da primeira aba de um arquivo, pra conferir visualmente "é essa planilha mesmo?"
 * antes de ler/processar o conteúdo de verdade — limita a poucas linhas pra não travar em
 * planilhas grandes (a de markup, por exemplo, tem mais de 1500 linhas).
 */
export async function gerarPreviaPlanilha(arquivo: File, maxLinhas = 30): Promise<PreviaPlanilha> {
  const buffer = await arquivo.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const nomeAba = workbook.SheetNames[0]
  const ws = workbook.Sheets[nomeAba]

  const refCompleto = ws['!ref']
  if (!refCompleto) {
    return { htmlPreview: '<p>(aba vazia)</p>', nomeAba, totalLinhas: 0, linhasMostradas: 0 }
  }
  const range = XLSX.utils.decode_range(refCompleto)
  const totalLinhas = range.e.r - range.s.r + 1
  const linhasMostradas = Math.min(totalLinhas, maxLinhas)
  const ultimaLinha = range.s.r + linhasMostradas - 1

  // sheet_to_html não tem opção de range — monta uma planilha só com as linhas
  // mostradas, copiando as células originais, em vez de renderizar tudo.
  const wsLimitado: XLSX.WorkSheet = {
    '!ref': XLSX.utils.encode_range({ s: range.s, e: { r: ultimaLinha, c: range.e.c } }),
  }
  for (let r = range.s.r; r <= ultimaLinha; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (ws[addr] !== undefined) wsLimitado[addr] = ws[addr]
    }
  }
  const htmlPreview = XLSX.utils.sheet_to_html(wsLimitado)

  return { htmlPreview, nomeAba, totalLinhas, linhasMostradas }
}
