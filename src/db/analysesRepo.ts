import { calculateItem } from '../calc/calculator'
import { dbDelete, dbGet, dbGetAll, dbPut, STORE_ANALISES } from './db'
import { proximoCodigoCotacao } from './configRepo'
import { makeId } from '../utils'
import type {
  DadosFreteTransportadora,
  ItemFechado,
  MedidasCargaFrete,
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
      items: [{ id: makeId(), product: { ...record.product, estadoOrigem: record.product.estadoOrigem || 'SP' }, pricing: record.pricing }],
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
    // itens salvos antes do campo UF existir (ou salvos em branco) ficam sem nenhuma opção
    // selecionada no <select> — cai pra SP, o mesmo padrão de item novo
    items: (record.items ?? []).map((item) => ({
      ...item,
      product: { ...item.product, estadoOrigem: item.product.estadoOrigem || 'SP' },
    })),
    itensPreRegistro: record.itensPreRegistro ?? [],
    freteTransportadoras: record.freteTransportadoras ?? {},
    fretePorFornecedor: record.fretePorFornecedor ?? {},
    cargaFretePorFornecedor: record.cargaFretePorFornecedor ?? {},
    itensFechados: record.itensFechados ?? {},
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
  empresaId?: string,
  dataSolicitacao?: number,
  numeroCotacaoTransportadora?: string,
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
    // tudo que essa função não gerencia (frete por transportadora/fornecedor salvo na aba Frete,
    // valores fechados do Pedido de Compra e qualquer campo que vier a existir) passa adiante
    // intacto — antes o registro era montado do zero e cada "Salvar cotação" apagava esses dados
    ...base,
    id: existingId ?? makeId(),
    codigo,
    criadoPor: base?.criadoPor || atorAdmin,
    vendedor,
    tipoReferencia,
    cliente,
    maquina,
    empresaId: empresaId ?? base?.empresaId,
    items,
    itensPreRegistro: base?.itensPreRegistro ?? [],
    planilhaOriginal: base?.planilhaOriginal,
    dataSolicitacao: dataSolicitacao ?? base?.dataSolicitacao,
    numeroCotacaoTransportadora: numeroCotacaoTransportadora ?? base?.numeroCotacaoTransportadora,
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

/** Salva a lista de pré-registro (Interno, Referência, Quantidade) da cotação, sem mexer nos itens já precificados.
 * `dataSolicitacao` e `numeroCotacaoTransportadora` são opcionais — quando omitidos, preservam o valor já salvo
 * (evita apagar ao chamar de fluxos que não mexem nesses campos, como a importação de planilha). */
export async function updateItensPreRegistro(
  id: string,
  itens: PreRegistroItem[],
  atorAdmin: string,
  dataSolicitacao?: number,
  numeroCotacaoTransportadora?: string,
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

  const atualizado: QuoteRecord = {
    ...normalizado,
    itensPreRegistro: itens,
    dataSolicitacao: dataSolicitacao ?? normalizado.dataSolicitacao,
    numeroCotacaoTransportadora: numeroCotacaoTransportadora ?? normalizado.numeroCotacaoTransportadora,
    updatedAt: Date.now(),
  }
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

/** Chave do fornecedor nos dados de frete — o nome como aparece nos itens da cotação, sem
 * diferença de maiúscula/espaço (o mesmo critério usado pra agrupar os itens por fornecedor). */
export function chaveFornecedorFrete(nomeFornecedor: string): string {
  return nomeFornecedor.trim().toUpperCase()
}

/** Fornecedores distintos (pela chave de frete) que aparecem nos itens da cotação. */
function chavesFornecedoresDaCotacao(quote: Pick<QuoteRecord, 'items'>): string[] {
  return Array.from(new Set(quote.items.map((it) => chaveFornecedorFrete(it.product.fornecedor)).filter(Boolean)))
}

/** Todos os dados de frete salvos de um fornecedor da cotação, por transportadora. Cotações salvas
 * antes do frete ser separado por fornecedor guardavam tudo direto em `freteTransportadoras` (um
 * conjunto só pra cotação inteira) — esses dados continuam valendo quando a cotação tem um
 * fornecedor só (aí não tem dúvida de quem era). */
export function freteDoFornecedor(
  quote: Pick<QuoteRecord, 'items' | 'fretePorFornecedor' | 'freteTransportadoras'>,
  nomeFornecedor: string,
): Record<string, DadosFreteTransportadora> {
  const chave = chaveFornecedorFrete(nomeFornecedor)
  const proprio = chave ? quote.fretePorFornecedor?.[chave] : undefined
  const fornecedores = chavesFornecedoresDaCotacao(quote)
  const legado = fornecedores.length <= 1 ? (quote.freteTransportadoras ?? {}) : {}
  return { ...legado, ...(proprio ?? {}) }
}

/** Salva os dados de pedido de frete (campos do formulário + valor/número da cotação recebida) de
 * uma transportadora pra um fornecedor específico da cotação, sem mexer nos das outras
 * transportadoras nem nos dos outros fornecedores — cada fornecedor despacha de um lugar diferente,
 * então cada um tem a sua própria cotação de frete. Lê a versão atual do servidor antes de gravar
 * (não usa a cópia da tela), pra não desfazer o que outra aba salvou nesse meio-tempo. */
export async function salvarFreteTransportadora(
  id: string,
  nomeFornecedor: string,
  transportadora: string,
  dados: DadosFreteTransportadora,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const chave = chaveFornecedorFrete(nomeFornecedor)
  const dadosComData: DadosFreteTransportadora = { ...dados, salvoEm: Date.now() }
  const atualizado: QuoteRecord = chave
    ? {
        ...normalizado,
        fretePorFornecedor: {
          ...normalizado.fretePorFornecedor,
          [chave]: { ...freteDoFornecedor(normalizado, nomeFornecedor), [transportadora]: dadosComData },
        },
        updatedAt: Date.now(),
      }
    : {
        // sem fornecedor definido nos itens ainda — guarda no conjunto geral da cotação
        ...normalizado,
        freteTransportadoras: { ...normalizado.freteTransportadoras, [transportadora]: dadosComData },
        updatedAt: Date.now(),
      }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

/** Tira o valor/número da cotação de frete de uma transportadora (pra um fornecedor), mantendo os
 * campos do pedido de frete que já tinham sido preenchidos pra ela. */
export async function limparCotacaoFreteTransportadora(
  id: string,
  nomeFornecedor: string,
  transportadora: string,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const existente = freteDoFornecedor(normalizeRecord(atual), nomeFornecedor)[transportadora]
  return salvarFreteTransportadora(id, nomeFornecedor, transportadora, {
    camposPedido: existente?.camposPedido ?? {},
    valorCotacao: '',
    numeroCotacao: '',
  })
}

/** Medidas da carga (cm/kg) informadas na aba Frete pra um fornecedor da cotação — preenchem
 * sozinhas os campos de medida/peso do pedido de frete de todas as transportadoras. */
export async function salvarCargaFrete(id: string, nomeFornecedor: string, carga: MedidasCargaFrete): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const atualizado: QuoteRecord = {
    ...normalizado,
    cargaFretePorFornecedor: { ...normalizado.cargaFretePorFornecedor, [chaveFornecedorFrete(nomeFornecedor)]: carga },
    updatedAt: Date.now(),
  }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

/** Busca a versão atual de uma cotação direto do servidor (sem a lista inteira). */
export async function buscarQuote(id: string): Promise<QuoteRecord | undefined> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  return atual ? normalizeRecord(atual) : undefined
}

/** Salva os valores "fechados" (Pedido de Compra) de todos os itens de uma vez — vem sempre do
 * objeto inteiro (mais simples que mesclar item a item, e a tela sempre edita a cotação inteira). */
export async function salvarItensFechados(id: string, itensFechados: Record<string, ItemFechado>): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const atualizado: QuoteRecord = { ...normalizado, itensFechados, updatedAt: Date.now() }
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

/** Mesma busca de `findByInterno`, mas pelo código "Referência". */
export async function findByReferencia(referencia: string): Promise<ProductInput | undefined> {
  const target = referencia.trim().toLowerCase()
  if (!target) return undefined
  const quotes = await listQuotes()
  for (const quote of quotes) {
    for (const item of quote.items) {
      if (item.product.referencia.trim().toLowerCase() === target) {
        return item.product
      }
    }
  }
  return undefined
}

export interface UltimoUsoDoProduto {
  product: ProductInput
  /** Código da cotação de onde veio esse preço (ex.: "COT-0042"). */
  codigo: string
  /** Quando essa cotação foi atualizada pela última vez. */
  data: number
}

/** Último uso de um produto (por Interno ou Referência) numa cotação — preferindo a cotação mais
 * recente em que ele JÁ TINHA preço (valor unitário > 0), pra "último preço usado" mostrar um valor
 * de verdade, e não um item que ainda estava esperando cotação. Sem nenhum uso com preço, cai pro
 * uso mais recente de qualquer jeito (ainda serve pra carregar descrição, NCM, peso etc.). */
export async function buscarUltimoUsoDoProduto(campo: 'interno' | 'referencia', valor: string): Promise<UltimoUsoDoProduto | undefined> {
  const target = valor.trim().toLowerCase()
  if (!target) return undefined
  const quotes = await listQuotes()
  let semPreco: UltimoUsoDoProduto | undefined
  for (const quote of quotes) {
    for (const item of quote.items) {
      if (item.product[campo].trim().toLowerCase() !== target) continue
      const uso = { product: item.product, codigo: quote.codigo, data: quote.updatedAt }
      if (item.product.valorUnt > 0) return uso
      semPreco ??= uso
    }
  }
  return semPreco
}
