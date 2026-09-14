import { NOTA_FISCAL_TIPOS } from './types'
import type { NotaFiscal, NotaFiscalTipo } from './types'

// ---------------------------------------------------------------------------
// Mês de referência de uma nota fiscal (mês de emissão, ou de registro quando
// a nota não tem data de emissão informada) — usado tanto pra agrupar em
// pastas mensais quanto pra tendência dos dashboards.
// ---------------------------------------------------------------------------
export function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function chaveMesDaNota(n: NotaFiscal): string {
  const data = n.dataEmissao ? new Date(`${n.dataEmissao}T00:00:00`) : new Date(n.createdAt)
  return chaveMes(data)
}

export function labelDoMes(mesKey: string): string {
  const [ano, mes] = mesKey.split('-').map(Number)
  const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function labelCurtoDoMes(mesKey: string): string {
  const [ano, mes] = mesKey.split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`
}

/** Data em que os três meses de retenção do mês de referência se encerram. */
export function dataLimiteDoMes(mesKey: string): number {
  const [ano, mes] = mesKey.split('-').map(Number)
  return new Date(ano, mes - 1 + 3, 1).getTime()
}

// cores fixas por tipo — mesma ordem da paleta categórica usada nos status, pra manter consistência visual
export const CORES_TIPO: Record<NotaFiscalTipo, string> = { PECAS: '#2a78d6', IMPLEMENTOS: '#eb6834' }

export function corDoTipo(tipo: NotaFiscalTipo): string {
  return CORES_TIPO[tipo] ?? CORES_TIPO.PECAS
}

export function labelDoTipo(tipo: NotaFiscalTipo): string {
  return NOTA_FISCAL_TIPOS.find((t) => t.value === tipo)?.label ?? tipo
}
