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

/** Timestamp -> "YYYY-MM-DD" (data local, não UTC) pra preencher um <input type="date">. */
export function dateToInputValue(ts: number | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** "YYYY-MM-DD" de um <input type="date"> -> timestamp de meia-noite local (evita o "dia errado"
 * que `new Date("YYYY-MM-DD")` dá por interpretar como UTC). */
export function inputValueToDate(value: string): number | undefined {
  if (!value) return undefined
  const [yyyy, mm, dd] = value.split('-').map(Number)
  if (!yyyy || !mm || !dd) return undefined
  return new Date(yyyy, mm - 1, dd).getTime()
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

/** A cotação de menor valor unitário entre as devolvidas por fornecedores, ou undefined se não houver nenhuma. */
export function melhorCotacaoFornecedor<T extends { valorUnitario: number }>(
  cotacoes: T[] | undefined,
): T | undefined {
  if (!cotacoes || cotacoes.length === 0) return undefined
  return cotacoes.reduce((menor, atual) => (atual.valorUnitario < menor.valorUnitario ? atual : menor))
}

/** Cotação que pode ser escolhida como a melhor: tem preço e tem alguma quantidade pra entregar
 * (o fornecedor que devolveu quantidade 0 não atende nada, por mais barato que seja). */
export function cotacaoAtende(cotacao: { valorUnitario: number; quantidadeDisponivel?: number }): boolean {
  return cotacao.valorUnitario > 0 && cotacao.quantidadeDisponivel !== 0
}

/** Quantas unidades da quantidade pedida a cotação atende (sem quantidade informada, atende tudo). */
export function quantidadeAtendida(cotacao: { quantidadeDisponivel?: number }, quantidadePedida: number): number {
  if (cotacao.quantidadeDisponivel === undefined) return quantidadePedida
  return Math.max(0, Math.min(cotacao.quantidadeDisponivel, quantidadePedida))
}

/** Como juntar fornecedores pra chegar na quantidade pedida, do mais barato pro mais caro: cada um
 * entra com o que tem até completar. `faltam` > 0 quando nem todos juntos têm a quantidade toda. */
export function planoDeAtendimento<T extends { valorUnitario: number; quantidadeDisponivel?: number }>(
  cotacoes: T[],
  quantidadePedida: number,
): { partes: { cotacao: T; quantidade: number }[]; faltam: number } {
  const partes: { cotacao: T; quantidade: number }[] = []
  let faltam = quantidadePedida
  const porPreco = cotacoes.filter((c) => c.valorUnitario > 0).sort((a, b) => a.valorUnitario - b.valorUnitario)
  for (const cotacao of porPreco) {
    if (faltam <= 0) break
    const quantidade = quantidadeAtendida(cotacao, faltam)
    if (quantidade > 0) {
      partes.push({ cotacao, quantidade })
      faltam -= quantidade
    }
  }
  return { partes, faltam: Math.max(0, faltam) }
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
