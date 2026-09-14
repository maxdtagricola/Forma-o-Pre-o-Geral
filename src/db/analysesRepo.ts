import { calculateItem } from '../calc/calculator'
import { dbDelete, dbGet, dbGetAll, dbPut, STORE_ANALISES } from './db'
import { proximoCodigoCotacao } from './configRepo'
import { makeId } from '../utils'
import type {
  PedidoCompraInfo,
  PreRegistroItem,
  PricingConfig,
  ProductInput,
  QuoteItem,
  QuoteRecord,
  QuoteStatus,
  TipoReferencia,
} from '../types'

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
      codigo: '',
      criadoPor: '',
      vendedor: '',
      tipoReferencia: 'itens',
      cliente: '',
      maquina: '',
      items: [{ id: makeId(), product: record.product, pricing: record.pricing }],
      itensPreRegistro: [],
      status: 'PENDENTE',
      responsavelStatus: '',
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
    codigo: record.codigo ?? '',
    criadoPor: record.criadoPor ?? '',
    vendedor: record.vendedor ?? '',
    tipoReferencia: record.tipoReferencia ?? 'itens',
    cliente: record.cliente ?? '',
    maquina: record.maquina ?? '',
    itensPreRegistro: record.itensPreRegistro ?? [],
    status: record.status ?? 'PENDENTE',
    responsavelStatus: record.responsavelStatus ?? '',
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
  atorAdmin: string,
  vendedor: string,
  tipoReferencia: TipoReferencia,
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

  if (base && base.status !== 'PENDENTE' && base.responsavelStatus && base.responsavelStatus !== atorAdmin) {
    throw new Error(
      `Essa cotação está sendo analisada por ${base.responsavelStatus} — só ele(a) pode alterá-la agora.`,
    )
  }

  const codigo = base?.codigo || (await proximoCodigoCotacao())

  const record: QuoteRecord = {
    id: existingId ?? makeId(),
    codigo,
    criadoPor: base?.criadoPor || atorAdmin,
    vendedor,
    tipoReferencia,
    cliente,
    maquina,
    items,
    itensPreRegistro: base?.itensPreRegistro ?? [],
    planilhaOriginal: base?.planilhaOriginal,
    status: base?.status ?? 'PENDENTE',
    responsavelStatus: base?.responsavelStatus ?? '',
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
  atorAdmin: string,
  pedidoCompra?: PedidoCompraInfo,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)

  if (
    normalizado.status !== 'PENDENTE' &&
    normalizado.responsavelStatus &&
    normalizado.responsavelStatus !== atorAdmin
  ) {
    throw new Error(
      `Essa cotação está sendo analisada por ${normalizado.responsavelStatus} — só ele(a) pode mudar o status agora.`,
    )
  }

  const now = Date.now()
  const atualizado: QuoteRecord = {
    ...normalizado,
    status: novoStatus,
    responsavelStatus: novoStatus === 'PENDENTE' ? '' : atorAdmin,
    statusHistory: [...normalizado.statusHistory, { status: novoStatus, changedAt: now }],
    pedidoCompra: novoStatus === 'PEDIDO DE COMPRA' ? pedidoCompra : normalizado.pedidoCompra,
    updatedAt: now,
  }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

/** Salva a lista de pré-registro (Interno, Referência, Quantidade) da cotação, sem mexer nos itens já precificados. */
export async function updateItensPreRegistro(
  id: string,
  itens: PreRegistroItem[],
  atorAdmin: string,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)

  if (
    normalizado.status !== 'PENDENTE' &&
    normalizado.responsavelStatus &&
    normalizado.responsavelStatus !== atorAdmin
  ) {
    throw new Error(
      `Essa cotação está sendo analisada por ${normalizado.responsavelStatus} — só ele(a) pode alterá-la agora.`,
    )
  }

  const atualizado: QuoteRecord = { ...normalizado, itensPreRegistro: itens, updatedAt: Date.now() }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

/** Guarda a planilha original do cliente (só usado logo na criação, por importação de planilha). */
export async function setPlanilhaOriginal(
  id: string,
  planilha: { nomeArquivo: string; conteudoBase64: string },
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const atualizado: QuoteRecord = { ...normalizado, planilhaOriginal: planilha, updatedAt: Date.now() }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

export async function deleteQuote(id: string, atorAdmin: string): Promise<void> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (atual) {
    const normalizado = normalizeRecord(atual)
    if (normalizado.status !== 'PENDENTE' && normalizado.responsavelStatus && normalizado.responsavelStatus !== atorAdmin) {
      throw new Error(
        `Essa cotação está sendo analisada por ${normalizado.responsavelStatus} — só ele(a) pode excluí-la agora.`,
      )
    }
  }
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
