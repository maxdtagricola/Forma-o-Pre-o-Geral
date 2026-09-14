export type Periodo = 'mes' | 'bimestre' | 'semestre' | 'anual'

export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'mes', label: 'Mês' },
  { value: 'bimestre', label: 'Bimestre' },
  { value: 'semestre', label: 'Semestre' },
  { value: 'anual', label: 'Anual' },
]

export function inicioPeriodo(periodo: Periodo): number {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = agora.getMonth()
  if (periodo === 'mes') return new Date(ano, mes, 1).getTime()
  if (periodo === 'bimestre') return new Date(ano, mes - (mes % 2), 1).getTime()
  if (periodo === 'semestre') return new Date(ano, mes < 6 ? 0 : 6, 1).getTime()
  return new Date(ano, 0, 1).getTime()
}
