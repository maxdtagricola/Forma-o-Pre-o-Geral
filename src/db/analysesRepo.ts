import { calculateItem } from '../calc/calculator'
import { dbDelete, dbGet, dbGetAll, dbPut, STORE_ANALISES } from './db'
import { makeId } from '../utils'
import type { PedidoCompraInfo, PricingConfig, ProductInput, QuoteItem, QuoteRecord, QuoteStatus } from '../types'

// Formato antigo (uma análise = um único produto), salvo antes da cotação
// com múltiplos itens existir. Mantido só para migrar registros já salvos.
interface LegacyAnalysisRecord {
  id: string
  product: ProductInput
  pricing: PricingConfig
  createdAt: number
  updatedAt: number
}

function isLegacyRecord(record: unknown): record is LegacyAnalysisRecord {
  return !!record && typeof record === 'object' && 'product' in record && !('items' in record)
}

function normalizeRecord(record: QuoteRecord | LegacyAnalysisRecord): QuoteRecord {
  if (isLegacyRecord(record)) {
    const result = calculateItem(record.product, record.pricing)
    return {
      id: record.id,
      criadoPor: '',
      vendedor: '',
      cliente: '',
      maquina: '',
      items: [{ id: makeId(), product: record.product, pricing: record.pricing }],
      status: 'PENDENTE',
      statusHistory: [{ status: 'PENDENTE', changedAt: record.createdAt }],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      summary: {
        totalItens: 1,
        precoVendaTotalGeral: result.precoVendaTotal,
      },
    }
  }
  // preenche campos que não existiam em versões anteriores do registro
  return {
    ...record,
    criadoPor: record.criadoPor ?? '',
    vendedor: record.vendedor ?? '',
    cliente: record.cliente ?? '',
    maquina: record.maquina ?? '',
    status: record.status ?? 'PENDENTE',
    statusHistory:
      record.statusHistory && record.statusHistory.length > 0
        ? record.statusHistory
        : [{ status: record.status ?? 'PENDENTE', changedAt: record.createdAt }],
  }
}

export async function listQuotes(): Promise<QuoteRecord[]> {
  const all = await dbGetAll<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES)
  return all.map(normalizeRecord).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveQuote(
  criadoPor: string,
  vendedor: string,
  cliente: string,
  maquina: string,
  items: QuoteItem[],
  existingId?: string,
): Promise<QuoteRecord> {
  const now = Date.now()
  const precoVendaTotalGeral = items.reduce(
    (sum, item) => sum + calculateItem(item.product, item.pricing).precoVendaTotal,
    0,
  )

  // ao editar uma cotação já existente, preserva quem criou e o histórico de status
  const existente = existingId ? await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, existingId) : undefined
  const base = existente ? normalizeRecord(existente) : undefined

  const record: QuoteRecord = {
    id: existingId ?? makeId(),
    criadoPor: base?.criadoPor || criadoPor,
    vendedor,
    cliente,
    maquina,
    items,
    status: base?.status ?? 'PENDENTE',
    statusHistory: base?.statusHistory ?? [{ status: 'PENDENTE', changedAt: now }],
    pedidoCompra: base?.pedidoCompra,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    summary: {
      totalItens: items.length,
      precoVendaTotalGeral,
    },
  }
  await dbPut(STORE_ANALISES, record)
  return record
}

export async function updateQuoteStatus(
  id: string,
  novoStatus: QuoteStatus,
  pedidoCompra?: PedidoCompraInfo,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const now = Date.now()
  const atualizado: QuoteRecord = {
    ...normalizado,
    status: novoStatus,
    statusHistory: [...normalizado.statusHistory, { status: novoStatus, changedAt: now }],
    pedidoCompra: novoStatus === 'PEDIDO DE COMPRA' ? pedidoCompra : normalizado.pedidoCompra,
    updatedAt: now,
  }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

export async function deleteQuote(id: string): Promise<void> {
  await dbDelete(STORE_ANALISES, id)
}

/** Busca, no item mais recente com o mesmo código "Interno", os dados gerais do produto. */
export async function findByInterno(interno: string): Promise<ProductInput | undefined> {
  const target = interno.trim().toLowerCase()
  if (!target) return undefined
  const quotes = await listQuotes()
  for (const quote of quotes) {
    for (const item of quote.items) {
      if (item.product.interno.trim().toLowerCase() === target) {
        return item.product
      }
    }
  }
  return undefined
}
