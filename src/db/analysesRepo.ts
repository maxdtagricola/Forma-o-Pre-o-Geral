import { calculateItem } from '../calc/calculator'
import { dbDelete, dbGet, dbGetAll, dbPut, STORE_ANALISES } from './db'
import { proximoCodigoCotacao } from './configRepo'
import { makeId } from '../utils'
import type {
  DadosFreteTransportadora,
  DadosTransporte,
  ItemExcluidoCotacao,
  ItemFaturado,
  ItemFechado,
  MedidasCargaFrete,
  PedidoCompraInfo,
  PreRegistroItem,
  PricingConfig,
  ProducaoPedido,
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
    itensFaturados: record.itensFaturados ?? {},
    itensExcluidos: record.itensExcluidos ?? [],
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

/** Item com algum dado de verdade — linha em branco (ex.: a que toda cotação nova já começa) não
 * precisa ir pro arquivo de itens excluídos. */
function itemTemDados(item: QuoteItem): boolean {
  const p = item.product
  return !!(p.interno.trim() || p.referencia.trim() || p.descricao.trim() || p.fornecedor.trim() || p.valorUnt > 0)
}

/** Atualiza o arquivo de itens excluídos de uma cotação: todo item que estava salvo nela (ou que a
 * tela avisou ter tirado antes mesmo de salvar) e não está mais em `items` entra no arquivo, com quem
 * tirou e quando; item que voltou pra cotação (restaurado) sai do arquivo. */
function arquivarItensExcluidos(
  base: QuoteRecord | undefined,
  items: QuoteItem[],
  itensRemovidos: QuoteItem[],
  atorAdmin: string,
  agora: number,
): ItemExcluidoCotacao[] {
  const idsAtuais = new Set(items.map((i) => i.id))
  const candidatos = new Map<string, QuoteItem>()
  for (const item of [...(base?.items ?? []), ...itensRemovidos]) {
    if (!idsAtuais.has(item.id) && !candidatos.has(item.id) && itemTemDados(item)) candidatos.set(item.id, item)
  }
  const anteriores = (base?.itensExcluidos ?? []).filter((e) => !idsAtuais.has(e.item.id) && !candidatos.has(e.item.id))
  const novos = Array.from(candidatos.values()).map((item) => ({ item, excluidoEm: agora, excluidoPor: atorAdmin }))
  return [...anteriores, ...novos]
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
  opcoes?: {
    /** Itens tirados na tela desde o último salvamento — entram no arquivo de excluídos mesmo que
     * nunca tenham chegado a ser salvos na cotação. */
    itensRemovidos?: QuoteItem[]
  },
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
    itensExcluidos: arquivarItensExcluidos(base, items, opcoes?.itensRemovidos ?? [], atorAdmin, now),
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
  /** Justificativa de quem arquivou — obrigatória ao ir pra ARQUIVO (ver pedirMotivoArquivamento). */
  arquivamento?: { motivo: string; detalhe: string },
  /** Produção do pedido (todo ou parte) — pedida ao ir pra PEDIDO CONFIRMADO (ver pedirProducao). */
  producao?: Omit<ProducaoPedido, 'em' | 'por'>,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  exigirResponsavel(normalizado, atorAdmin)

  const now = Date.now()
  const atualizado: QuoteRecord = {
    ...normalizado,
    status: novoStatus,
    responsavelStatus: novoStatus === 'PENDENTE' ? '' : atorAdmin,
    statusHistory: [...normalizado.statusHistory, { status: novoStatus, changedAt: now }],
    pedidoCompra: novoStatus === 'PEDIDO DE COMPRA' ? pedidoCompra : normalizado.pedidoCompra,
    motivoArquivamento:
      novoStatus === 'ARQUIVO' && arquivamento ? { ...arquivamento, em: now, por: atorAdmin } : normalizado.motivoArquivamento,
    producao: novoStatus === 'PEDIDO CONFIRMADO' && producao ? { ...producao, em: now, por: atorAdmin } : normalizado.producao,
    updatedAt: now,
  }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

/** Fora de PENDENTE, só quem pegou a cotação (responsavelStatus) muda o status dela. */
function exigirResponsavel(cotacao: QuoteRecord, atorAdmin: string) {
  if (cotacao.status !== 'PENDENTE' && cotacao.responsavelStatus && cotacao.responsavelStatus !== atorAdmin) {
    throw new Error(`Essa cotação está sendo analisada por ${cotacao.responsavelStatus} — só ele(a) pode mudar o status agora.`)
  }
}

/** Atualiza a produção do pedido (aba Pedido de Compra), sem mudar o status. */
export async function salvarProducao(id: string, producao: Omit<ProducaoPedido, 'em' | 'por'>, atorAdmin: string): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const now = Date.now()
  const atualizado: QuoteRecord = { ...normalizado, producao: { ...producao, em: now, por: atorAdmin }, updatedAt: now }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

// a entrega só mexe no status enquanto a mercadoria está a caminho — de CONFERIDO em diante (ou
// arquivada) o status fica como está
const STATUS_DA_ENTREGA: QuoteStatus[] = ['EM TRANSPORTE', 'CADASTRO DE PRODUTO', 'PARCIALMENTE ENTREGUE', 'ENTREGUE']

/** Marca (ou desmarca) a mercadoria dos fornecedores `chaves` como entregue e acerta o status pelos
 * fornecedores do pedido (`todasAsChaves`): todos entregues → ENTREGUE; só alguns → PARCIALMENTE
 * ENTREGUE; nenhum (ao desfazer) → volta pra EM TRANSPORTE. */
export async function registrarEntrega(
  id: string,
  alvo: { chaves: string[]; todasAsChaves: string[]; entregue: boolean },
  atorAdmin: string,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const mudaStatus = STATUS_DA_ENTREGA.includes(normalizado.status)
  if (mudaStatus) exigirResponsavel(normalizado, atorAdmin)

  const now = Date.now()
  const transporte = { ...normalizado.transportePorFornecedor }
  for (const chave of alvo.chaves) {
    const anterior: DadosTransporte = transporte[chave] ?? {
      numeroNotaFiscal: '',
      numeroCotacaoFrete: '',
      transportadora: '',
      linkRastreio: '',
      atualizadoEm: now,
      atualizadoPor: atorAdmin,
    }
    transporte[chave] = alvo.entregue
      ? { ...anterior, entregueEm: now, entreguePor: atorAdmin }
      : { ...anterior, entregueEm: undefined, entreguePor: undefined }
  }

  let status = normalizado.status
  if (mudaStatus) {
    const entregues = alvo.todasAsChaves.filter((chave) => transporte[chave]?.entregueEm).length
    if (entregues > 0 && entregues === alvo.todasAsChaves.length) status = 'ENTREGUE'
    else if (entregues > 0) status = 'PARCIALMENTE ENTREGUE'
    else if (status === 'PARCIALMENTE ENTREGUE' || status === 'ENTREGUE') status = 'EM TRANSPORTE'
  }

  const atualizado: QuoteRecord = {
    ...normalizado,
    transportePorFornecedor: transporte,
    status,
    responsavelStatus: status !== normalizado.status ? atorAdmin : normalizado.responsavelStatus,
    statusHistory: status !== normalizado.status ? [...normalizado.statusHistory, { status, changedAt: now }] : normalizado.statusHistory,
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

/** Quem despacha a mercadoria: o fornecedor dos itens (o nome como está neles) e o estado de onde
 * ela sai (a UF de origem dos itens). O mesmo fornecedor em estados diferentes é outra origem —
 * outra filial, outro frete — e fica separado em tudo (itens da cotação, frete, pedido). */
export interface RemetenteFrete {
  nome: string
  uf?: string
}

function nomeNaChave(nome: string): string {
  return nome.trim().toUpperCase()
}

function ufNaChave(uf: string | undefined): string {
  return (uf ?? '').trim().toUpperCase()
}

/** Chave do fornecedor nos dados de frete: o nome como aparece nos itens da cotação (sem diferença
 * de maiúscula/espaço) + a UF de origem — o mesmo critério usado pra agrupar os itens. Sem UF, só o
 * nome (era o formato antes da separação por estado). */
export function chaveFornecedorFrete(nomeFornecedor: string, uf?: string): string {
  const nome = nomeNaChave(nomeFornecedor)
  const estado = ufNaChave(uf)
  return nome && estado ? `${nome}|${estado}` : nome
}

/** Os grupos fornecedor + UF que aparecem nos itens da cotação, na ordem em que cada um aparece
 * pela primeira vez (itens sem fornecedor ficam de fora). */
export function remetentesDaCotacao(quote: Pick<QuoteRecord, 'items'>): Array<RemetenteFrete & { chave: string }> {
  const vistos = new Map<string, RemetenteFrete & { chave: string }>()
  for (const it of quote.items) {
    const nome = it.product.fornecedor.trim()
    if (!nome) continue
    const chave = chaveFornecedorFrete(nome, it.product.estadoOrigem)
    if (!vistos.has(chave)) vistos.set(chave, { nome, uf: ufNaChave(it.product.estadoOrigem) || undefined, chave })
  }
  return Array.from(vistos.values())
}

/** Nome do grupo pra mostrar na tela: o fornecedor e, quando ele aparece com mais de um estado na
 * mesma cotação, a UF junto — é o que diferencia um grupo do outro. */
export function rotuloRemetente(remetente: RemetenteFrete, todos: RemetenteFrete[]): string {
  const nome = remetente.nome.trim()
  const uf = ufNaChave(remetente.uf)
  if (!nome || !uf) return nome
  const estadosDoNome = new Set(todos.filter((r) => nomeNaChave(r.nome) === nomeNaChave(nome)).map((r) => ufNaChave(r.uf)))
  return estadosDoNome.size > 1 ? `${nome} — ${uf}` : nome
}

/** Antes da separação por UF o frete ficava salvo só com o nome do fornecedor — esses dados
 * continuam valendo pro primeiro grupo daquele fornecedor nos itens: quase sempre o único, e,
 * havendo mais de um estado, o grupo que já existia quando o frete foi salvo. */
function ehPrimeiroGrupoDoFornecedor(quote: Pick<QuoteRecord, 'items'>, remetente: RemetenteFrete): boolean {
  const uf = ufNaChave(remetente.uf)
  if (!uf) return true
  const nome = nomeNaChave(remetente.nome)
  const primeiro = quote.items.find((it) => nomeNaChave(it.product.fornecedor) === nome)
  return !primeiro || ufNaChave(primeiro.product.estadoOrigem) === uf
}

/** Todos os dados de frete salvos de um fornecedor (+ UF) da cotação, por transportadora. Também
 * considera os formatos antigos: o frete salvo só com o nome do fornecedor (antes da separação por
 * UF) e, mais antigo ainda, o conjunto único da cotação inteira em `freteTransportadoras` — esse só
 * quando a cotação tem um fornecedor só (aí não tem dúvida de quem era). */
export function freteDoFornecedor(
  quote: Pick<QuoteRecord, 'items' | 'fretePorFornecedor' | 'freteTransportadoras'>,
  remetente: RemetenteFrete,
): Record<string, DadosFreteTransportadora> {
  const nome = nomeNaChave(remetente.nome)
  // itens ainda sem fornecedor: o frete fica no conjunto geral da cotação
  if (!nome) return { ...(quote.freteTransportadoras ?? {}) }
  const chave = chaveFornecedorFrete(remetente.nome, remetente.uf)
  const primeiroGrupo = ehPrimeiroGrupoDoFornecedor(quote, remetente)
  const proprio = quote.fretePorFornecedor?.[chave]
  const legadoSoNome = primeiroGrupo && chave !== nome ? quote.fretePorFornecedor?.[nome] : undefined
  const nomesNaCotacao = new Set(quote.items.map((it) => nomeNaChave(it.product.fornecedor)).filter(Boolean))
  const legadoCotacao = primeiroGrupo && nomesNaCotacao.size <= 1 ? (quote.freteTransportadoras ?? {}) : {}
  return { ...legadoCotacao, ...(legadoSoNome ?? {}), ...(proprio ?? {}) }
}

/** Medidas da carga salvas pra um fornecedor (+ UF) da cotação — com o mesmo aproveitamento do
 * formato antigo (só o nome) que o frete. */
export function cargaDoFornecedor(
  quote: Pick<QuoteRecord, 'items' | 'cargaFretePorFornecedor'>,
  remetente: RemetenteFrete,
): MedidasCargaFrete | undefined {
  const chave = chaveFornecedorFrete(remetente.nome, remetente.uf)
  const propria = quote.cargaFretePorFornecedor?.[chave]
  if (propria) return propria
  const nome = nomeNaChave(remetente.nome)
  return chave !== nome && ehPrimeiroGrupoDoFornecedor(quote, remetente) ? quote.cargaFretePorFornecedor?.[nome] : undefined
}

/** Salva os dados de pedido de frete (campos do formulário + valor/número da cotação recebida) de
 * uma transportadora pra um fornecedor (+ UF) específico da cotação, sem mexer nos das outras
 * transportadoras nem nos dos outros fornecedores — cada origem tem a sua própria cotação de frete.
 * Lê a versão atual do servidor antes de gravar (não usa a cópia da tela), pra não desfazer o que
 * outra aba salvou nesse meio-tempo. */
export async function salvarFreteTransportadora(
  id: string,
  remetente: RemetenteFrete,
  transportadora: string,
  dados: DadosFreteTransportadora,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const chave = chaveFornecedorFrete(remetente.nome, remetente.uf)
  const dadosComData: DadosFreteTransportadora = { ...dados, salvoEm: Date.now() }
  const atualizado: QuoteRecord = chave
    ? {
        ...normalizado,
        fretePorFornecedor: {
          ...normalizado.fretePorFornecedor,
          [chave]: { ...freteDoFornecedor(normalizado, remetente), [transportadora]: dadosComData },
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
  remetente: RemetenteFrete,
  transportadora: string,
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const existente = freteDoFornecedor(normalizeRecord(atual), remetente)[transportadora]
  return salvarFreteTransportadora(id, remetente, transportadora, {
    camposPedido: existente?.camposPedido ?? {},
    valorCotacao: '',
    numeroCotacao: '',
  })
}

/** Medidas da carga (cm/kg) informadas na aba Frete pra um fornecedor (+ UF) da cotação — preenchem
 * sozinhas os campos de medida/peso do pedido de frete de todas as transportadoras. */
export async function salvarCargaFrete(id: string, remetente: RemetenteFrete, carga: MedidasCargaFrete): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const atualizado: QuoteRecord = {
    ...normalizado,
    cargaFretePorFornecedor: {
      ...normalizado.cargaFretePorFornecedor,
      [chaveFornecedorFrete(remetente.nome, remetente.uf)]: carga,
    },
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

/** Salva os dados de transporte (NF, cotação do frete, transportadora, rastreio) dos fornecedores
 * informados, sem mexer nos dos outros — lendo a versão atual do servidor antes de gravar. */
export async function salvarTransporte(id: string, porFornecedor: Record<string, DadosTransporte>): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  // mescla por fornecedor: o que a tela não manda (ex.: a marca de entregue) continua como estava
  const transporte = { ...normalizado.transportePorFornecedor }
  for (const [chave, dados] of Object.entries(porFornecedor)) transporte[chave] = { ...transporte[chave], ...dados }
  const atualizado: QuoteRecord = {
    ...normalizado,
    transportePorFornecedor: transporte,
    updatedAt: Date.now(),
  }
  await dbPut(STORE_ANALISES, atualizado)
  return atualizado
}

/** Salva o faturamento da cotação (aba Faturamento): o quanto de cada item foi faturado e por qual
 * valor, mais o nº da nota de venda e a data — tudo de uma vez, lendo a versão atual do servidor
 * antes de gravar pra não desfazer o que outra aba salvou. */
export async function salvarFaturamento(
  id: string,
  dados: { itensFaturados: Record<string, ItemFaturado>; notaFaturamento: string; dataFaturamento: string },
): Promise<QuoteRecord> {
  const atual = await dbGet<QuoteRecord | LegacyAnalysisRecord>(STORE_ANALISES, id)
  if (!atual) throw new Error('Cotação não encontrada no servidor.')
  const normalizado = normalizeRecord(atual)
  const atualizado: QuoteRecord = {
    ...normalizado,
    itensFaturados: dados.itensFaturados,
    notaFaturamento: dados.notaFaturamento.trim() || undefined,
    dataFaturamento: dados.dataFaturamento || undefined,
    updatedAt: Date.now(),
  }
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
