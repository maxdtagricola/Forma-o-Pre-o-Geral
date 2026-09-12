import { calculateItem } from '../calc/calculator'
import { dbDelete, dbGetAll, dbPut, STORE_ANALISES } from './db'
import { makeId } from '../utils'
import type { PricingConfig, ProductInput, QuoteItem, QuoteRecord } from '../types'

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
      cliente: '',
      maquina: '',
      items: [{ id: makeId(), product: record.product, pricing: record.pricing }],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      summary: {
        totalItens: 1,
        precoVendaTotalGeral: result.precoVendaTotal,
      },
    }
  }
  // registros salvos antes do campo cliente/máquina existir
  return {
    ...record,
    cliente: record.cliente ?? '',
    maquina: record.maquina ?? '',
  }
}

export async function listQuotes(): Promise<QuoteRecord[]> {
  const all = await dbGetAll<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES)
  return all.map(normalizeRecord).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveQuote(
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
  const record: QuoteRecord = {
    id: existingId ?? makeId(),
    cliente,
    maquina,
    items,
    createdAt: now,
    updatedAt: now,
    summary: {
      totalItens: items.length,
      precoVendaTotalGeral,
    },
  }
  await dbPut(STORE_ANALISES, record)
  return record
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
