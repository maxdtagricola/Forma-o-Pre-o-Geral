import { diasUteisDesde } from './diasUteis'
import type { QuoteRecord, QuoteStatus } from './types'

// -----------------------------------------------------------------------
// Andamento da cotação/pedido: cada mudança de status fica guardada à parte
// (statusHistory) — de onde veio, pra onde foi, quem mudou e quando — pra
// acompanhar as datas de processamento sem mexer no resto da cotação.
// -----------------------------------------------------------------------

export interface PassoDoStatus {
  /** Status de antes (o primeiro registro, a criação, não tem). */
  de?: QuoteStatus
  para: QuoteStatus
  em: number
  por?: string
  /** Dias úteis desde a mudança anterior. */
  diasUteis?: number
}

/** As mudanças de status, da mais antiga pra mais recente — registros antigos (sem "de") herdam o
 * status da mudança anterior. */
export function passosDoStatus(cotacao: Pick<QuoteRecord, 'statusHistory'>): PassoDoStatus[] {
  const passos: PassoDoStatus[] = []
  cotacao.statusHistory.forEach((h, i) => {
    const anterior = i > 0 ? cotacao.statusHistory[i - 1] : undefined
    passos.push({
      de: h.de ?? anterior?.status,
      para: h.status,
      em: h.changedAt,
      por: h.por,
      diasUteis: anterior ? diasUteisDesde(anterior.changedAt, h.changedAt) : undefined,
    })
  })
  return passos
}

/** Quando a cotação virou pedido de compra — a passagem de ENVIADO pra PEDIDO DE COMPRA mais recente
 * (ou, se ela chegou lá vindo de outro status, a última vez que entrou em PEDIDO DE COMPRA). */
export function entradaNoPedidoDeCompra(cotacao: Pick<QuoteRecord, 'statusHistory'>): (PassoDoStatus & { enviadaEm?: number }) | undefined {
  const passos = passosDoStatus(cotacao)
  const entradas = passos.filter((p) => p.para === 'PEDIDO DE COMPRA')
  const entrada = [...entradas].reverse().find((p) => p.de === 'ENVIADO') ?? entradas[entradas.length - 1]
  if (!entrada) return undefined
  // a ida pra ENVIADO logo antes dela (quando a cotação foi mandada ao cliente)
  const indice = passos.indexOf(entrada)
  const envio = entrada.de === 'ENVIADO' ? passos.slice(0, indice).reverse().find((p) => p.para === 'ENVIADO') : undefined
  return { ...entrada, enviadaEm: envio?.em }
}

/** "06/10/2026 às 14:32" */
export function dataHora(quando: number): string {
  const d = new Date(quando)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
