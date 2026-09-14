export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return 'R$ 0,00'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0%'
  return `${(value * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Converte string de input percentual ("25" -> 0.25) preservando o que o usuário digitou. */
export function pctToFraction(input: number): number {
  return input / 100
}
export function fractionToPct(value: number): number {
  return Math.round(value * 10000) / 100
}

/** Seleciona todo o conteúdo do campo ao focar — assim, digitar substitui o "0" em vez de grudar do lado. */
export function selecionarTudoAoFocar(e: { target: HTMLInputElement }): void {
  e.target.select()
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
