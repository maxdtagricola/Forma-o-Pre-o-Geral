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

/**
 * Aba "RBC" (Convênio 52/91): coluna A tem os NCMs elegíveis à redução de
 * base de cálculo; colunas 37/38 trazem a alíquota interestadual "normal"
 * por estado de origem, e 41/42 a alíquota reduzida (RBC) por estado — uma
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

  const rbcNcms = new Set<string>()
  for (let r = 1; r <= maxRow; r++) {
    const valor = cellValue(ws, r, 1)
    if (valor === undefined || valor === null || valor === '') continue
    const texto = String(valor).trim()
    if (!/^\d+$/.test(texto)) continue // ignora linhas de título/cabeçalho
    rbcNcms.add(texto)
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
 * Aba "ICMS ST" — cada linha é um NCM dentro de uma categoria (col. 3) com
 * seu MVA por alíquota interestadual (col. 9/10/11) e a marcação de ST
 * (col. 12). O mesmo NCM pode aparecer em mais de uma categoria com MVA
 * diferente; nesse caso prioriza "Autopeças" — se não houver, fica com a
 * primeira ocorrência encontrada na planilha. Linhas com preço por PMPF (ou
 * outro texto no lugar do MVA) são ignoradas, por não serem representáveis
 * como um percentual só.
 */
function parseIcmsSt(ws: XLSX.WorkSheet): Record<string, StInfo> {
  const maxRow = sheetMaxRow(ws)
  interface Entrada {
    mva04: number
    mva07: number
    mva12: number
    st: boolean
    categoria: string
  }
  const porNcm = new Map<string, Entrada[]>()

  for (let r = 3; r <= maxRow; r++) {
    const ncmRaw = cellValue(ws, r, 1)
    if (ncmRaw === undefined || ncmRaw === null || ncmRaw === '') continue
    const ncm = String(ncmRaw).trim()

    const mva04raw = cellValue(ws, r, 9)
    const mva07raw = cellValue(ws, r, 10)
    const mva12raw = cellValue(ws, r, 11)
    const algumNaoNumerico = [mva04raw, mva07raw, mva12raw].some(
      (v) => v !== undefined && v !== null && v !== '' && typeof v !== 'number',
    )
    if (algumNaoNumerico) continue // ex.: preço por PMPF

    const stRaw = cellValue(ws, r, 12)
    const categoria = String(cellValue(ws, r, 3) ?? '')

    const entrada: Entrada = {
      mva04: typeof mva04raw === 'number' ? mva04raw : 0,
      mva07: typeof mva07raw === 'number' ? mva07raw : 0,
      mva12: typeof mva12raw === 'number' ? mva12raw : 0,
      st: !!stRaw,
      categoria,
    }
    const lista = porNcm.get(ncm) ?? []
    lista.push(entrada)
    porNcm.set(ncm, lista)
  }

  const resultado: Record<string, StInfo> = {}
  for (const [ncm, entradas] of porNcm) {
    const distintos = new Set(entradas.map((e) => `${e.mva04}|${e.mva07}|${e.mva12}`))
    let escolhida: Entrada
    if (distintos.size <= 1) {
      escolhida = entradas[0]
    } else {
      escolhida = entradas.find((e) => e.categoria.toUpperCase().includes('AUTOPE')) ?? entradas[0]
    }
    resultado[ncm] = { mva04: escolhida.mva04, mva07: escolhida.mva07, mva12: escolhida.mva12, st: escolhida.st }
  }

  if (Object.keys(resultado).length === 0) {
    throw new Error('Não encontrei NCMs válidos na aba de ICMS-ST.')
  }
  return resultado
}

export interface ResultadoImportacao {
  rbc: RbcData
  icmsSt: Record<string, StInfo>
  totalNcmsRbc: number
  totalNcmsIcmsSt: number
}

export async function lerPlanilhaMarkup(arquivo: File): Promise<ResultadoImportacao> {
  const buffer = await arquivo.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const wsRbc = workbook.Sheets['RBC']
  if (!wsRbc) throw new Error('Não encontrei a aba "RBC" nesse arquivo.')

  const nomeAbaIcms = workbook.SheetNames.find((n) => n.toUpperCase().replace(/\s+/g, ' ').startsWith('ICMS ST'))
  const wsIcms = nomeAbaIcms ? workbook.Sheets[nomeAbaIcms] : undefined
  if (!wsIcms) throw new Error('Não encontrei uma aba "ICMS ST" nesse arquivo.')

  const rbc = parseRbc(wsRbc)
  const icmsSt = parseIcmsSt(wsIcms)

  return {
    rbc,
    icmsSt,
    totalNcmsRbc: rbc.rbcNcms.length,
    totalNcmsIcmsSt: Object.keys(icmsSt).length,
  }
}
