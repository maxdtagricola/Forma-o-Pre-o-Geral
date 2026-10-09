import * as XLSX from 'xlsx'
import type { RbcData, StInfo } from './calc/calculator'

function cellValue(ws: XLSX.WorkSheet, row: number, col: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
  const cell = ws[addr]
  return cell ? cell.v : undefined
}

function sheetMaxRow(ws: XLSX.WorkSheet): number {
  const ref = ws['!ref']
  if (!ref) return 0
  return XLSX.utils.decode_range(ref).e.r + 1
}

/** NCM da coluna A como a fórmula da planilha compara: só os dígitos ("8544.42.00" e 85444200 são o
 * mesmo NCM). Vazio quando a célula não é um NCM (título, cabeçalho...). */
function ncmDaCelula(valor: unknown): string {
  if (valor === undefined || valor === null || valor === '') return ''
  const digitos = String(valor).replace(/\D/g, '')
  // NCM tem 8 dígitos — 7 é número que perdeu o zero da frente (ou erro de digitação na planilha,
  // que a fórmula também só acharia digitando igual); menos que isso é título/numeração
  return digitos.length >= 7 && digitos.length <= 8 ? digitos : ''
}

/** Texto da célula, sem espaços nas pontas e em maiúsculas — pra comparar com "ST", "RBC", "Mono". */
function marca(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toUpperCase() : ''
}

/** MVA da célula: número (0,6099), ou texto de porcentagem ("70,69 %", que o Excel em português
 * também converte sozinho na conta). Sem número nenhum (ex.: "PMPF", preço por pauta) fica null — a
 * fórmula da planilha dá erro nesse caso e a base do ST vira 0. */
function mvaDaCelula(valor: unknown): number | null {
  if (typeof valor === 'number') return valor
  if (typeof valor !== 'string' || !/\d/.test(valor)) return null
  const texto = valor.replace(/\s/g, '')
  const numero = Number(texto.replace('%', '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(numero)) return null
  return texto.includes('%') ? numero / 100 : numero
}

/**
 * Aba "RBC" (Convênio 52/91): coluna A tem os NCMs e a coluna F marca "RBC" nos elegíveis à redução
 * de base de cálculo (é o que a fórmula da aba Analise confere); colunas 37/38 trazem a alíquota
 * interestadual "normal" por estado de origem, e 41/42 a alíquota reduzida (RBC) por estado — uma
 * linha por estado, a partir da linha 2.
 */
function parseRbc(ws: XLSX.WorkSheet): RbcData {
  const maxRow = sheetMaxRow(ws)
  const rateNormal: Record<string, number> = {}
  const rateRbc: Record<string, number> = {}

  for (let r = 2; r <= maxRow; r++) {
    const estado1 = cellValue(ws, r, 37)
    const valor1 = cellValue(ws, r, 38)
    if (typeof estado1 === 'string' && typeof valor1 === 'number') {
      rateNormal[estado1.trim()] = valor1
    }
    const estado2 = cellValue(ws, r, 41)
    const valor2 = cellValue(ws, r, 42)
    if (typeof estado2 === 'string' && typeof valor2 === 'number') {
      rateRbc[estado2.trim()] = valor2
    }
  }

  // a fórmula procura o NCM (PROCV) e usa a primeira linha que achar
  const rbcNcms = new Set<string>()
  const vistos = new Set<string>()
  for (let r = 1; r <= maxRow; r++) {
    const ncm = ncmDaCelula(cellValue(ws, r, 1))
    if (!ncm || vistos.has(ncm)) continue
    vistos.add(ncm)
    if (marca(cellValue(ws, r, 6)) === 'RBC') rbcNcms.add(ncm)
  }

  if (Object.keys(rateNormal).length === 0 || Object.keys(rateRbc).length === 0) {
    throw new Error('Não encontrei a tabela de alíquotas por estado na aba "RBC" (colunas 37-42).')
  }
  if (rbcNcms.size === 0) {
    throw new Error('Não encontrei NCMs na aba "RBC" (coluna A).')
  }

  return { rateNormal, rateRbc, rbcNcms: Array.from(rbcNcms) }
}

/**
 * Aba "ICMS ST" — cada linha é um NCM dentro de uma categoria (col. 3) com seu MVA por alíquota
 * interestadual (col. 9/10/11) e a marcação "ST" (col. 12). Lida do jeito que a fórmula da aba
 * Analise lê: o NCM que aparece mais de uma vez vale pela primeira linha (CORRESP/ÍNDICE), e é ST
 * quando a coluna 12 diz "ST". MVA em texto ("70,69 %") vira número; sem número (ex.: "PMPF") fica
 * null — antes essas linhas eram descartadas e o NCM saía como tributação normal, cobrando ICMS na
 * venda de um item que a planilha trata como ST.
 */
function parseIcmsSt(ws: XLSX.WorkSheet): Record<string, StInfo> {
  const maxRow = sheetMaxRow(ws)
  const resultado: Record<string, StInfo> = {}
  for (let r = 3; r <= maxRow; r++) {
    const ncm = ncmDaCelula(cellValue(ws, r, 1))
    if (!ncm || resultado[ncm]) continue
    resultado[ncm] = {
      mva04: mvaDaCelula(cellValue(ws, r, 9)),
      mva07: mvaDaCelula(cellValue(ws, r, 10)),
      mva12: mvaDaCelula(cellValue(ws, r, 11)),
      st: marca(cellValue(ws, r, 12)) === 'ST',
    }
  }
  if (Object.keys(resultado).length === 0) {
    throw new Error('Não encontrei NCMs válidos na aba de ICMS-ST.')
  }
  return resultado
}

/** Aba "PISCOFINS": NCMs com PIS/COFINS monofásico — a coluna E diz "Mono" (o que a fórmula confere). */
function parsePisCofins(ws: XLSX.WorkSheet): Record<string, boolean> {
  const maxRow = sheetMaxRow(ws)
  const resultado: Record<string, boolean> = {}
  const vistos = new Set<string>()
  for (let r = 1; r <= maxRow; r++) {
    const ncm = ncmDaCelula(cellValue(ws, r, 1))
    if (!ncm || vistos.has(ncm)) continue
    vistos.add(ncm)
    if (marca(cellValue(ws, r, 5)) === 'MONO') resultado[ncm] = true
  }
  return resultado
}

/** A lista de NCMs da planilha (aba com "NCM" em A1 e as colunas RBC / ST — hoje a "Planilha1"): os
 * NCMs que a empresa já trabalha, inclusive os de tributação normal, que não aparecem nas abas de
 * ICMS ST, RBC nem PIS/COFINS. Não muda o cálculo — só evita o aviso de "NCM não vinculado". */
function parseListaNcms(workbook: XLSX.WorkBook): string[] {
  for (const nome of workbook.SheetNames) {
    const ws = workbook.Sheets[nome]
    if (marca(cellValue(ws, 1, 1)) !== 'NCM') continue
    const cabecalho = Array.from({ length: 12 }, (_, i) => marca(cellValue(ws, 1, i + 1)))
    if (!cabecalho.includes('ST') || !cabecalho.includes('RBC')) continue
    const ncms = new Set<string>()
    for (let r = 2; r <= sheetMaxRow(ws); r++) {
      const ncm = ncmDaCelula(cellValue(ws, r, 1))
      if (ncm) ncms.add(ncm)
    }
    return Array.from(ncms)
  }
  return []
}

export interface ResultadoImportacao {
  rbc: RbcData
  icmsSt: Record<string, StInfo>
  pisCofins: Record<string, boolean>
  ncmsLista: string[]
  totalNcmsRbc: number
  totalNcmsIcmsSt: number
  totalNcmsPisCofins: number
}

export async function lerPlanilhaMarkup(arquivo: File): Promise<ResultadoImportacao> {
  const buffer = await arquivo.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const wsRbc = workbook.Sheets['RBC']
  if (!wsRbc) throw new Error('Não encontrei a aba "RBC" nesse arquivo.')

  const nomeAbaIcms = workbook.SheetNames.find((n) => n.toUpperCase().replace(/\s+/g, ' ').startsWith('ICMS ST'))
  const wsIcms = nomeAbaIcms ? workbook.Sheets[nomeAbaIcms] : undefined
  if (!wsIcms) throw new Error('Não encontrei uma aba "ICMS ST" nesse arquivo.')

  const wsPisCofins = workbook.Sheets[workbook.SheetNames.find((n) => n.toUpperCase().replace(/[\s/]/g, '') === 'PISCOFINS') ?? '']
  if (!wsPisCofins) throw new Error('Não encontrei a aba "PISCOFINS" nesse arquivo.')

  const rbc = parseRbc(wsRbc)
  const icmsSt = parseIcmsSt(wsIcms)
  const pisCofins = parsePisCofins(wsPisCofins)
  const ncmsLista = parseListaNcms(workbook)

  return {
    rbc,
    icmsSt,
    pisCofins,
    ncmsLista,
    totalNcmsRbc: rbc.rbcNcms.length,
    totalNcmsIcmsSt: Object.keys(icmsSt).length,
    totalNcmsPisCofins: Object.keys(pisCofins).length,
  }
}
