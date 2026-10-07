import { pedirMotivoArquivamento, pedirProducao, type RespostaProducao } from './dialogs'
import type { QuoteItem, QuoteRecord, QuoteStatus } from './types'

// -----------------------------------------------------------------------
// O que é perguntado antes de mudar o status de uma cotação — igual em
// todas as telas que mudam status (Cotações, Histórico, Pedido de Compra,
// Faturamento): o motivo, ao arquivar; a produção, ao confirmar o pedido.
// -----------------------------------------------------------------------

/** Itens que entraram no pedido de compra — cotações de antes desse controle não têm a lista: todos. */
export function itensDoPedidoDeCompra(cotacao: Pick<QuoteRecord, 'items' | 'pedidoCompra'>): QuoteItem[] {
  const ids = cotacao.pedidoCompra?.itemIds
  if (!ids) return cotacao.items
  const permitidos = new Set(ids)
  return cotacao.items.filter((item) => permitidos.has(item.id))
}

function rotuloDoItem(item: QuoteItem, indice: number): string {
  const nome = [item.product.referencia, item.product.descricao].filter((x) => x?.trim()).join(' — ') || `Item ${indice + 1}`
  return item.product.qtd ? `${nome} ×${item.product.qtd}` : nome
}

/** Pergunta se o pedido está todo ou só em parte em produção — começando pelo que já foi informado. */
export function perguntarProducao(cotacao: Pick<QuoteRecord, 'codigo' | 'items' | 'pedidoCompra' | 'producao'>): Promise<RespostaProducao | null> {
  const itens = itensDoPedidoDeCompra(cotacao)
  const atual = cotacao.producao
  return pedirProducao(
    `${cotacao.codigo ? `${cotacao.codigo} — ` : ''}o pedido já está todo em produção no fornecedor, ou só uma parte?`,
    itens.map((item, i) => ({ id: item.id, rotulo: rotuloDoItem(item, i) })),
    atual ? { tipo: atual.tipo, itemIds: atual.itemIds, observacao: atual.observacao } : undefined,
  )
}

export interface RespostasDoStatus {
  arquivamento?: { motivo: string; detalhe: string }
  producao?: RespostaProducao
}

/** Pergunta o que o novo status precisa antes de mudar. null = cancelou, e o status não deve mudar. */
export async function perguntarAntesDoStatus(
  cotacao: Pick<QuoteRecord, 'codigo' | 'items' | 'pedidoCompra' | 'producao'>,
  novoStatus: QuoteStatus,
): Promise<RespostasDoStatus | null> {
  if (novoStatus === 'ARQUIVO') {
    // arquivar sempre pede o motivo de a cotação não ter fechado — sem motivo, não arquiva
    const arquivamento = await pedirMotivoArquivamento(`Por que a cotação ${cotacao.codigo || ''} não foi fechada?`)
    return arquivamento ? { arquivamento } : null
  }
  if (novoStatus === 'PEDIDO CONFIRMADO') {
    const producao = await perguntarProducao(cotacao)
    return producao ? { producao } : null
  }
  return {}
}
