import { makeId } from './utils'

// ---------------------------------------------------------------------------
// Acessos — só servem pra identificar quem criou cada cotação, sem senha nem
// permissões diferentes entre eles (todos têm acesso total ao app).
// ---------------------------------------------------------------------------
export type AdminName = 'Maicon' | 'Gouvêa' | 'Max'

export const ADMINS: AdminName[] = ['Maicon', 'Gouvêa', 'Max']

// ---------------------------------------------------------------------------
// Vendedor a quem a cotação se refere — usado pra organizar o histórico em
// pastas (admin > vendedor > mês).
// ---------------------------------------------------------------------------
export const VENDEDORES: string[] = ['EDSON', 'GABRIEL', 'SHELTON', 'BRUNO', 'JOAO', 'JOSE', 'THIAGO']

// ---------------------------------------------------------------------------
// Transportadoras cadastradas na aba Frete — lista inicial, cada uma com seu
// próprio espaço na aba.
// ---------------------------------------------------------------------------
export const TRANSPORTADORAS: string[] = ['CARVALIMA', 'EUCATUR', 'RODONAVES', 'VAPTLOG', 'GRANEXPRESS']

// ---------------------------------------------------------------------------
// Recebedores (filiais) sugeridos no Acompanhamento de notas.
// ---------------------------------------------------------------------------
export const RECEBEDORES: string[] = ['DANIEL TRATORES ARIQUEMES', 'DANIEL TRATORES RIO BRANCO', 'DANIEL TRATORES CEREJEIRAS']

// ---------------------------------------------------------------------------
// Notas fiscais — aba "Acompanhamento de notas", por enquanto só pro admin Max.
// Reaproveita o mesmo modelo de status das cotações (status + histórico), só
// que com os status do fluxo de recebimento de mercadoria.
// ---------------------------------------------------------------------------
export type NotaFiscalStatus =
  | 'AGUARDANDO COLETA'
  | 'EM TRANSPORTE'
  | 'EM VERIFICAÇÃO'
  | 'CONFERÊNCIA DO MATERIAL'
  | 'AGUARDANDO ENTRADA'
  | 'DEVOLUÇÃO PARCIAL'
  | 'DEVOLUÇÃO'
  | 'CONCLUIDO'

export const NOTA_FISCAL_STATUSES: NotaFiscalStatus[] = [
  'AGUARDANDO COLETA',
  'EM TRANSPORTE',
  'EM VERIFICAÇÃO',
  'CONFERÊNCIA DO MATERIAL',
  'AGUARDANDO ENTRADA',
  'DEVOLUÇÃO PARCIAL',
  'DEVOLUÇÃO',
  'CONCLUIDO',
]

export interface NotaFiscalStatusChange {
  status: NotaFiscalStatus
  changedAt: number
}

export type NotaFiscalTipo = 'PECAS' | 'IMPLEMENTOS'

export const NOTA_FISCAL_TIPOS: { value: NotaFiscalTipo; label: string }[] = [
  { value: 'PECAS', label: 'Peças' },
  { value: 'IMPLEMENTOS', label: 'Implementos' },
]

/** Por que algo foi transferido — o "selecionador" da nota e de cada produto dela, pra depois
 * filtrar quais transferências eram de fato necessárias (venda já fechada, oficina parada…) e quais
 * foram só reposição/remanejamento. Além dessas, aceita qualquer outra digitada na hora. */
export const NECESSIDADES_TRANSFERENCIA: { value: string; label: string }[] = [
  { value: 'VENDA', label: 'Venda (cliente aguardando)' },
  { value: 'OFICINA', label: 'Oficina / ordem de serviço' },
  { value: 'GARANTIA', label: 'Garantia' },
  { value: 'ESTOQUE', label: 'Reposição de estoque' },
  { value: 'REMANEJAMENTO', label: 'Remanejamento entre filiais' },
  { value: 'DEVOLUCAO', label: 'Devolução' },
]

export function labelNecessidade(valor: string | undefined): string {
  if (!valor) return ''
  return NECESSIDADES_TRANSFERENCIA.find((n) => n.value === valor)?.label ?? valor
}

/** O que aconteceu com o que foi transferido: faturado (virou venda) ou parado no estoque (não
 * vendeu — a transferência não gerou o lucro esperado e conta como prejuízo). Vazio = ainda não se
 * sabe. Vale pra nota inteira ou pra cada produto dela (o do produto, quando marcado, vence). */
export type ResultadoTransferencia = '' | 'FATURADO' | 'ESTOQUE'

export const RESULTADOS_TRANSFERENCIA: { value: Exclude<ResultadoTransferencia, ''>; label: string; curto: string }[] = [
  { value: 'FATURADO', label: 'Faturado', curto: 'Faturado' },
  { value: 'ESTOQUE', label: 'Parado no estoque (prejuízo)', curto: 'Estoque' },
]

export function labelResultado(valor: ResultadoTransferencia | undefined, curto = false): string {
  const r = RESULTADOS_TRANSFERENCIA.find((x) => x.value === valor)
  return r ? (curto ? r.curto : r.label) : ''
}

/** Um produto da nota (as linhas "Dados do produto/serviço" da DANFE, ou os <det> do XML). */
export interface NotaFiscalItem {
  id: string
  /** Código do produto na nota (cProd) — normalmente o código interno da empresa. */
  codigo: string
  descricao: string
  ncm: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  /** Necessidade da transferência desse produto — vazio = vale a da nota inteira. */
  necessidade: string
  /** Faturado / parado no estoque — vazio = vale o da nota inteira. Registros antigos não têm. */
  resultado?: ResultadoTransferencia
}

export interface NotaFiscal {
  id: string
  numeroNfe: string
  fornecedor: string
  recebedor: string
  transportadora: string
  valorNota: number
  valorFrete: number
  /** Data em que a nota foi emitida (YYYY-MM-DD) — pode ser anterior à data de registro no sistema. */
  dataEmissao: string
  tipo: NotaFiscalTipo
  /** Necessidade da transferência da nota como um todo (padrão pros produtos dela). Registros
   * antigos não têm. */
  necessidade?: string
  /** Faturado / parado no estoque, pra nota inteira (padrão pros produtos dela). */
  resultado?: ResultadoTransferencia
  /** Produtos a que a nota se refere. Registros antigos não têm. */
  itens?: NotaFiscalItem[]
  status: NotaFiscalStatus
  statusHistory: NotaFiscalStatusChange[]
  criadoPor: string
  createdAt: number
}

export const DEFAULT_NOTA_FISCAL: Omit<NotaFiscal, 'id' | 'criadoPor' | 'createdAt' | 'status' | 'statusHistory'> = {
  numeroNfe: '',
  fornecedor: '',
  recebedor: '',
  transportadora: '',
  valorNota: 0,
  valorFrete: 0,
  dataEmissao: '',
  tipo: 'PECAS',
  necessidade: '',
  resultado: '',
  itens: [],
}

// ---------------------------------------------------------------------------
// Estado de destino (perfil de cálculo) — cada planilha original (RBC, ICMS
// ST e alíquotas) foi construída para um estado de destino específico.
// ---------------------------------------------------------------------------
export type EstadoDestino = 'RO' | 'AC'

export const ESTADOS_DESTINO: { value: EstadoDestino; label: string }[] = [
  { value: 'RO', label: 'Rondônia' },
  { value: 'AC', label: 'Acre' },
]

// ---------------------------------------------------------------------------
// Dados de entrada do produto — espelham exatamente as colunas A:J da aba
// "Analise" da planilha original.
// ---------------------------------------------------------------------------
export interface ProductInput {
  perfil: EstadoDestino
  referencia: string
  ncm: string
  interno: string
  fornecedor: string
  marca: string
  /** Alíquota de frete sobre o valor do produto, em fração (0.05 = 5%) */
  freteRate: number
  estadoOrigem: string
  qtd: number
  descricao: string
  /** Valor unitário de compra (R$) */
  valorUnt: number
  /** Peso do produto, em kg */
  peso: number
  /** Prazo de entrega (texto livre, ex.: "IMEDIATO", "2 DIAS") — usado ao devolver a planilha do cliente preenchida. */
  prazoEntrega: string
  /** Cotações de fornecedores registradas em "Comparar fornecedores" — a mais barata preenche fornecedor/marca/valorUnt automaticamente. */
  cotacoesFornecedores: CotacaoFornecedorItem[]

  // Campos avançados — existem na planilha (colunas U, V, W, Y, Z, AA) mas
  // não fazem parte da entrada principal pedida. Têm padrão 0.
  stRetido: number
  outrasDespesas: number
  desconto: number
  ipi: number
  freteAdicional: number
  credIcmsFrete: number
}

export const DEFAULT_PRODUCT_INPUT: ProductInput = {
  perfil: 'RO',
  referencia: '',
  ncm: '',
  interno: '',
  fornecedor: '',
  marca: '',
  freteRate: 0,
  estadoOrigem: 'SP',
  qtd: 1,
  descricao: '',
  valorUnt: 0,
  peso: 0,
  prazoEntrega: '',
  cotacoesFornecedores: [],
  stRetido: 0,
  outrasDespesas: 0,
  desconto: 0,
  ipi: 0,
  freteAdicional: 0,
  credIcmsFrete: 0,
}

// ---------------------------------------------------------------------------
// Componentes de formação de preço — espelham a linha de configuração
// global (célula 8) da aba "Analise": IMP.FED, Outros, COMISSAO,
// CUSTO FIXO e LUCRO, todos em fração (0.25 = 25%).
// ---------------------------------------------------------------------------
export interface PricingConfig {
  impFedPct: number
  outrosPct: number
  comissaoPct: number
  custoFixoPct: number
  lucroPct: number
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  impFedPct: 0.03,
  outrosPct: 0,
  comissaoPct: 0.04,
  custoFixoPct: 0.1,
  lucroPct: 0.25,
}

export const MARGENS_RAPIDAS = [0.1, 0.15, 0.2, 0.25] as const

// ---------------------------------------------------------------------------
// Item de uma cotação — a maioria das cotações reais tem vários produtos,
// cada um com seu próprio perfil de estado e sua própria formação de preço
// (comissão, margem etc. podem variar de item para item).
// ---------------------------------------------------------------------------
export interface QuoteItem {
  id: string
  product: ProductInput
  pricing: PricingConfig
}

export function createQuoteItem(): QuoteItem {
  return {
    id: makeId(),
    product: { ...DEFAULT_PRODUCT_INPUT },
    pricing: { ...DEFAULT_PRICING_CONFIG },
  }
}

// ---------------------------------------------------------------------------
// Classificação tributária de um item
// ---------------------------------------------------------------------------
export type ClassificacaoIcms = 'Normal' | 'RBC' | 'ST' | 'ST RET'
export type ClassificacaoPisCofins = 'Mono' | 'Poli'

export interface CalculationResult {
  classificacaoIcms: ClassificacaoIcms
  classificacaoPisCofins: ClassificacaoPisCofins
  isRbcElegivel: boolean
  /** Falso quando o NCM não aparece em nenhuma das tabelas da planilha de MARKUP (RBC, ICMS-ST, PIS/COFINS). */
  ncmCadastrado: boolean

  vlrProduto: number // X
  freteCalculado: number // T
  baseSubstituicao: number | null // AI
  mva: number | null // AJ
  icmsSubstituicao: number // AK
  icmsCreditoCompra: number // R

  custoFinalTotal: number // AL
  custoUnitario: number // AM

  cmvFracao: number // BB
  markupMultiplicador: number // BC
  viavel: boolean // BB > 0

  precoVendaTotal: number // AR
  precoVendaUnitario: number // AN
  indexador: number | null // BD

  breakdown: {
    impFed: number
    outros: number
    comissao: number
    custoFixo: number
    lucro: number
    pis: number
    cofins: number
    icmsRo: number
  }
}

// ---------------------------------------------------------------------------
// Status de uma cotação — acompanha o fluxo desde o pedido até o arquivo.
// ---------------------------------------------------------------------------
export type QuoteStatus =
  | 'PENDENTE'
  | 'AGUARDANDO FORNECEDOR'
  | 'ANALISANDO VALORES'
  | 'ENVIADO'
  | 'PEDIDO DE COMPRA'
  | 'PEDIDO CONFIRMADO'
  | 'EM TRANSPORTE'
  | 'CADASTRO DE PRODUTO'
  | 'PARCIALMENTE ENTREGUE'
  | 'ENTREGUE'
  | 'CONFERIDO'
  | 'FATURADO'
  | 'ARQUIVO'

export const QUOTE_STATUSES: QuoteStatus[] = [
  'PENDENTE',
  'AGUARDANDO FORNECEDOR',
  'ANALISANDO VALORES',
  'ENVIADO',
  'PEDIDO DE COMPRA',
  'PEDIDO CONFIRMADO',
  'EM TRANSPORTE',
  'CADASTRO DE PRODUTO',
  'PARCIALMENTE ENTREGUE',
  'ENTREGUE',
  'CONFERIDO',
  'FATURADO',
  'ARQUIVO',
]

export interface StatusChange {
  status: QuoteStatus
  changedAt: number
}

// ---------------------------------------------------------------------------
// A que a cotação se refere — definido já na criação, antes de precificar.
// ---------------------------------------------------------------------------
export type TipoReferencia = 'planilha' | 'itens'

export const TIPOS_REFERENCIA: { value: TipoReferencia; label: string }[] = [
  { value: 'planilha', label: 'PLANILHA COMPLETA' },
  { value: 'itens', label: 'SOMENTE ALGUNS ITENS' },
]

/** Preenchido quando o status vira "PEDIDO DE COMPRA": pedido completo ou só alguns itens. */
export interface PedidoCompraInfo {
  tipo: 'completo' | 'parcial'
  itemIds: string[]
}

/** Valores "fechados" de um item na aba Pedido de Compra — separados de item.product de propósito:
 * a negociação inicial (feita na correria) e o que realmente saiu no fechamento com o fornecedor
 * costumam ser diferentes, e a comparação entre os dois só funciona se um não sobrescrever o outro. */
export interface ItemFechado {
  qtd: number
  valorUnt: number
  freteRate: number
}

/** Quanto de um item foi faturado pro cliente (aba Faturamento) — comparado com o preço de venda que
 * foi passado na cotação antes do pedido. Separado de item.product pelo mesmo motivo do ItemFechado:
 * um não pode sobrescrever o outro, senão a comparação some. */
export interface ItemFaturado {
  qtd: number
  valorUnt: number
  registradoEm: number
  registradoPor: string
}

/** Item que saiu de uma cotação — fica guardado no próprio registro dela, no servidor, com quem
 * tirou e quando: o item nunca some do sistema e dá pra trazer de volta. */
export interface ItemExcluidoCotacao {
  item: QuoteItem
  excluidoEm: number
  excluidoPor: string
}

// ---------------------------------------------------------------------------
// Pré-registro — lista rápida (Interno, Referência, Quantidade) dos itens que
// ainda precisam ser cotados, preenchida antes de ir pra precificação.
// ---------------------------------------------------------------------------
/** Uma cotação de preço devolvida por um fornecedor, pra comparar e escolher a melhor. */
export interface CotacaoFornecedorItem {
  id: string
  fornecedor: string
  marca: string
  valorUnitario: number
  /** Valor total cotado pelo fornecedor pra esse item — quando o fornecedor informou os dois (ex.:
   * na planilha, ou na mensagem/print da cotação), guarda o valor total dele mesmo, em vez de só
   * calcular unitário × quantidade; os dois às vezes divergem um pouco (arredondamento, desconto
   * fechado no total etc.) e vale a pena mostrar o que o fornecedor realmente cotou. */
  valorTotal?: number
  /** Prazo de entrega que esse fornecedor deu (texto livre, ex.: "IMEDIATO", "5 DIAS"). */
  prazoEntrega?: string
}

export interface PreRegistroItem {
  id: string
  interno: string
  referencia: string
  /** Preenchida quando o item vem de uma planilha importada — ajuda a identificar o item mesmo sem Interno. */
  descricao?: string
  quantidade: number
  /** Cotações de fornecedores devolvidas pra esse item — a mais barata vira o valor/fornecedor ao ir pra precificação. */
  cotacoesFornecedores?: CotacaoFornecedorItem[]
}

// ---------------------------------------------------------------------------
// Registro salvo no histórico (IndexedDB) — uma cotação inteira, com um ou
// mais itens.
// ---------------------------------------------------------------------------

/** Dados do pedido de frete salvos por transportadora numa cotação — tanto os campos do
 * formulário de pedido (CNPJ, CEP, peso etc.) quanto o retorno dela (valor e número da cotação). */
export interface DadosFreteTransportadora {
  camposPedido: Record<string, string>
  valorCotacao: string
  numeroCotacao: string
  /** Quando foi salvo pela última vez. */
  salvoEm?: number
}

/** Medidas da carga pro pedido de frete — comprimento/largura/altura sempre em centímetros e peso
 * em quilos, informados uma vez e repassados (já com a unidade) pra todas as transportadoras. */
export interface MedidasCargaFrete {
  comprimentoCm: number
  larguraCm: number
  alturaCm: number
  pesoKg: number
}

export interface QuoteRecord {
  id: string
  /** Código sequencial (ex.: "COT-0001") pra facilitar o acompanhamento — registros antigos podem não ter. */
  codigo: string
  /** Quem criou a cotação — só um identificador, não controla permissão. */
  criadoPor: string
  /** Vendedor a quem a cotação se refere — usado pra organizar o histórico em pastas. */
  vendedor: string
  /** Se a cotação se refere a uma planilha completa ou só a alguns itens. */
  tipoReferencia: TipoReferencia
  /** Dados iniciais da cotação — quem pediu e pra qual máquina, além dos itens. */
  cliente: string
  maquina: string
  /** Empresa do grupo (destinatário) pra qual essa cotação está sendo feita — usada pra carregar o frete automaticamente. */
  empresaId?: string
  items: QuoteItem[]
  /** Itens ainda não precificados — lista rápida preenchida antes da precificação. */
  itensPreRegistro: PreRegistroItem[]
  /** Planilha original enviada pelo cliente, guardada pra devolver com valores e prazos preenchidos. */
  planilhaOriginal?: { nomeArquivo: string; conteudoBase64: string }
  status: QuoteStatus
  /** Admin que tirou a cotação de PENDENTE — só ele pode mudar o status até voltar pra PENDENTE. */
  responsavelStatus: string
  statusHistory: StatusChange[]
  pedidoCompra?: PedidoCompraInfo
  /** Data em que o cliente pediu a cotação (editável) — diferente de createdAt, que é quando o registro foi criado no sistema. */
  dataSolicitacao?: number
  /** Número da cotação de frete que a transportadora informou, pra referência depois. */
  numeroCotacaoTransportadora?: string
  /** Dados de pedido de frete + retorno (valor, número) salvos por transportadora, ver Frete —
   * formato antigo, um conjunto só pra cotação inteira (hoje só usado quando os itens ainda não têm
   * fornecedor definido). O atual é `fretePorFornecedor`. */
  freteTransportadoras?: Record<string, DadosFreteTransportadora>
  /** Frete separado por fornecedor (chave: nome do fornecedor dos itens em maiúsculas + UF de
   * origem, ver chaveFornecedorFrete) e, dentro dele, por transportadora — cada fornecedor (e cada
   * estado de onde ele despacha) tem as suas próprias cotações de frete. Registros de antes da
   * separação por UF têm a chave só com o nome. */
  fretePorFornecedor?: Record<string, Record<string, DadosFreteTransportadora>>
  /** Medidas da carga (cm/kg) por fornecedor, informadas na aba Frete — mesma chave do frete. */
  cargaFretePorFornecedor?: Record<string, MedidasCargaFrete>
  /** Valores fechados por item na aba Pedido de Compra — chave é o id do QuoteItem. */
  itensFechados?: Record<string, ItemFechado>
  /** Valores faturados por item na aba Faturamento — chave é o id do QuoteItem. */
  itensFaturados?: Record<string, ItemFaturado>
  /** Nº da(s) nota(s) fiscal(is) de venda e data do faturamento (aba Faturamento). */
  notaFaturamento?: string
  dataFaturamento?: string
  /** Itens que já saíram dessa cotação — guardados aqui pra nunca sumirem do sistema. */
  itensExcluidos?: ItemExcluidoCotacao[]
  createdAt: number
  updatedAt: number
  // resumo pré-calculado para exibição rápida na lista do histórico
  summary: {
    totalItens: number
    precoVendaTotalGeral: number
  }
}

// ---------------------------------------------------------------------------
// Catálogo de produtos — registro independente, sobrevive mesmo se todas as
// cotações onde o produto apareceu forem excluídas depois (sincronizado a
// partir delas, mas não derivado só delas — ver produtosRepo.ts).
// ---------------------------------------------------------------------------
/** Um registro de preço já visto pra um produto do catálogo — fornecedor, marca e valor unitário,
 * de quando esse item foi precificado numa cotação. */
export interface ProdutoCotacaoHistorico {
  fornecedor: string
  marca: string
  valorUnt: number
  registradoEm: number
}

export interface Produto {
  id: string
  interno: string
  descricao: string
  /** Pode ter mais de uma — fornecedores diferentes às vezes usam códigos diferentes pro mesmo item. */
  referencias: string[]
  ncm: string
  peso: number
  createdAt: number
  updatedAt: number
  /** As duas cotações mais baratas já vistas pra esse produto (fornecedor/marca/valor), a mais
   * barata sempre no índice 0 — pra saber rápido onde comprou mais barato e por quanto. */
  melhoresCotacoes?: ProdutoCotacaoHistorico[]
}

// ---------------------------------------------------------------------------
// Cadastro de fornecedores — dados completos de endereço, para dar base a um
// futuro cálculo de frete a partir da origem de cada fornecedor.
// ---------------------------------------------------------------------------
export interface Fornecedor {
  id: string
  cnpj: string
  nome: string
  cep: string
  rua: string
  numero: string
  bairro: string
  cidade: string
  estado: string
}

export const DEFAULT_FORNECEDOR: Omit<Fornecedor, 'id'> = {
  cnpj: '',
  nome: '',
  cep: '',
  rua: '',
  numero: '',
  bairro: '',
  cidade: '',
  estado: 'RO',
}

// ---------------------------------------------------------------------------
// Empresas (do próprio grupo) que recebem os materiais — usadas como destino
// no cálculo de frete automático da aba Frete. Endereço completo, igual ao
// fornecedor.
// ---------------------------------------------------------------------------
// Campos espelham exatamente o quadro "Destinatário/Remetente" da NF-e (DANFE).
export interface Empresa {
  id: string
  nome: string
  cnpj: string
  endereco: string
  bairro: string
  cep: string
  municipio: string
  uf: string
  email: string
}

export const DEFAULT_EMPRESA: Omit<Empresa, 'id'> = {
  nome: '',
  cnpj: '',
  endereco: '',
  bairro: '',
  cep: '',
  municipio: '',
  uf: 'RO',
  email: '',
}
