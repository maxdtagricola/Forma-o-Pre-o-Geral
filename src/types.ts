import { makeId } from './utils'

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

export interface MarginPoint {
  margemPct: number
  precoVendaUnitario: number
  precoVendaTotal: number
  lucroValor: number
  markup: number
  viavel: boolean
}

// ---------------------------------------------------------------------------
// Registro salvo no histórico (IndexedDB) — uma cotação inteira, com um ou
// mais itens.
// ---------------------------------------------------------------------------
export interface QuoteRecord {
  id: string
  /** Dados iniciais da cotação — quem pediu e pra qual máquina, além dos itens. */
  cliente: string
  maquina: string
  items: QuoteItem[]
  createdAt: number
  updatedAt: number
  // resumo pré-calculado para exibição rápida na lista do histórico
  summary: {
    totalItens: number
    precoVendaTotalGeral: number
  }
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
  cidade: string
  estado: string
}

export const DEFAULT_FORNECEDOR: Omit<Fornecedor, 'id'> = {
  cnpj: '',
  nome: '',
  cep: '',
  rua: '',
  numero: '',
  cidade: '',
  estado: 'RO',
}
