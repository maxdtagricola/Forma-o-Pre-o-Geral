import { calculateItem } from './calc/calculator'
import type { QuoteItem, QuoteRecord } from './types'

/** Valor final da peça (custo unitário, impostos e frete inclusos — a mesma conta da precificação) com o
 * que realmente fechou com o fornecedor no Pedido de Compra; sem fechamento registrado, o da cotação. */
export function custoFinal(cotacao: QuoteRecord, item: QuoteItem): number {
  const f = cotacao.itensFechados?.[item.id]
  const product = f ? { ...item.product, valorUnt: f.valorUnt, freteRate: f.freteRate, qtd: f.qtd || item.product.qtd } : item.product
  return calculateItem(product, item.pricing).custoUnitario
}

/** Preço de venda unitário que foi passado ao cliente na cotação. */
export function precoPassado(item: QuoteItem): number {
  return calculateItem(item.product, item.pricing).precoVendaUnitario
}
