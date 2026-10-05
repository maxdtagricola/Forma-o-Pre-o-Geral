import { NOTA_FISCAL_TIPOS } from './types'
import type { NotaFiscal, NotaFiscalItem, NotaFiscalTipo, ResultadoTransferencia } from './types'

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

// cores fixas por tipo — mesma ordem da paleta categórica usada nos status, pra manter consistência visual
export const CORES_TIPO: Record<NotaFiscalTipo, string> = { PECAS: '#2a78d6', IMPLEMENTOS: '#eb6834' }

export function corDoTipo(tipo: NotaFiscalTipo): string {
  return CORES_TIPO[tipo] ?? CORES_TIPO.PECAS
}

export function labelDoTipo(tipo: NotaFiscalTipo): string {
  return NOTA_FISCAL_TIPOS.find((t) => t.value === tipo)?.label ?? tipo
}

// ---------------------------------------------------------------------------
// Resultado das transferências: o que foi faturado (virou venda) e o que ficou
// parado no estoque (prejuízo — a transferência não gerou o lucro esperado).
// ---------------------------------------------------------------------------

/** Cores do gráfico de faturamento × prejuízo — o par azul ↔ vermelho (polos opostos), validado pra
 * daltonismo e contraste nos dois temas. */
export const COR_FATURADO = '#2a78d6'
export const COR_PREJUIZO = '#e34948'

// Prejuízo automático: assim que a nota dá entrada (passa pra CONCLUIDO), o que ainda não foi
// marcado como faturado conta como parado no estoque (prejuízo) — e só vira faturado (lucro) quando
// alguém marca que vendeu. Vale pras entradas a partir desta data: as notas que já tinham dado
// entrada antes continuam "sem resultado" até alguém marcar (senão todo o histórico, que nunca foi
// marcado, viraria prejuízo de uma vez).
export const INICIO_PREJUIZO_AUTOMATICO = new Date(2026, 9, 5).getTime()

type NotaParaResultado = Pick<NotaFiscal, 'resultado' | 'status' | 'statusHistory' | 'createdAt'>

/** Quando a nota deu entrada (a última vez que passou pra CONCLUIDO) — undefined se ainda não deu. */
export function dataDaEntrada(n: Pick<NotaFiscal, 'status' | 'statusHistory' | 'createdAt'>): number | undefined {
  if (n.status !== 'CONCLUIDO') return undefined
  const entradas = (n.statusHistory ?? []).filter((h) => h.status === 'CONCLUIDO')
  return entradas.length > 0 ? entradas[entradas.length - 1].changedAt : n.createdAt
}

/** A nota deu entrada e cai na regra do prejuízo automático (ver INICIO_PREJUIZO_AUTOMATICO). */
export function prejuizoAutomatico(n: Pick<NotaFiscal, 'status' | 'statusHistory' | 'createdAt'>): boolean {
  const entrada = dataDaEntrada(n)
  return entrada !== undefined && entrada >= INICIO_PREJUIZO_AUTOMATICO
}

/** Resultado que vale pra nota inteira: o marcado nela, ou — sem marcação, depois da entrada — prejuízo. */
export function resultadoDaNota(n: NotaParaResultado): ResultadoTransferencia {
  return n.resultado || (prejuizoAutomatico(n) ? 'ESTOQUE' : '')
}

/** Resultado que vale pro produto: o dele mesmo, ou (vazio) o da nota inteira — que, sem marcação
 * depois da entrada, é prejuízo. */
export function resultadoDoItem(item: NotaFiscalItem, nota: NotaParaResultado): ResultadoTransferencia {
  return item.resultado || resultadoDaNota(nota)
}

export function valorDoItem(item: NotaFiscalItem): number {
  return item.valorTotal || (item.quantidade || 0) * (item.valorUnitario || 0)
}

export interface ValoresPorResultado {
  faturado: number
  /** Valor do que ficou parado no estoque — o prejuízo da transferência. */
  parado: number
  semResultado: number
  /** A parte do frete da nota gasta com o que ficou parado (proporcional ao valor dos produtos). */
  freteParado: number
}

/** Quanto de uma nota foi faturado, ficou parado no estoque ou ainda não tem resultado — pelos
 * produtos dela (cada um com o seu resultado ou o da nota) ou, sem produtos informados, pela nota
 * inteira. */
export function valoresPorResultado(n: NotaFiscal): ValoresPorResultado {
  const r: ValoresPorResultado = { faturado: 0, parado: 0, semResultado: 0, freteParado: 0 }
  const itens = n.itens ?? []
  if (itens.length === 0) {
    const valor = n.valorNota || 0
    const resultado = resultadoDaNota(n)
    if (resultado === 'FATURADO') r.faturado = valor
    else if (resultado === 'ESTOQUE') {
      r.parado = valor
      r.freteParado = n.valorFrete || 0
    } else r.semResultado = valor
    return r
  }
  let total = 0
  for (const item of itens) {
    const valor = valorDoItem(item)
    total += valor
    const resultado = resultadoDoItem(item, n)
    if (resultado === 'FATURADO') r.faturado += valor
    else if (resultado === 'ESTOQUE') r.parado += valor
    else r.semResultado += valor
  }
  if (total > 0) r.freteParado = (n.valorFrete || 0) * (r.parado / total)
  return r
}
