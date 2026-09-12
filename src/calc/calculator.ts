import rbcRoRaw from '../data/rbc.json'
import rbcAcRaw from '../data/rbcAc.json'
import icmsStRoRaw from '../data/icmsStRo.json'
import icmsStAcRaw from '../data/icmsStAc.json'
import pisCofinsRaw from '../data/pisCofins.json'
import type {
  CalculationResult,
  ClassificacaoIcms,
  ClassificacaoPisCofins,
  EstadoDestino,
  PricingConfig,
  ProductInput,
} from '../types'

// ---------------------------------------------------------------------------
// Tabelas de referência (extraídas célula a célula da planilha original:
// abas "RBC", "ICMS ST" e "PISCOFINS"). Cada estado de destino (perfil) tem
// sua própria planilha "Markup" — RBC e PIS/COFINS são tabelas federais e por
// isso são as mesmas para todos os perfis; só a alíquota reduzida "local" do
// RBC e o MVA do ICMS-ST mudam por estado.
// ---------------------------------------------------------------------------
interface RbcData {
  rateNormal: Record<string, number>
  rateRbc: Record<string, number>
  rbcNcms: string[]
}
interface StInfo {
  mva04: number
  mva07: number
  mva12: number
  st: boolean
}

const pisCofinsMono = pisCofinsRaw as Record<string, boolean>

const RBC_BY_PERFIL: Record<EstadoDestino, RbcData> = {
  RO: rbcRoRaw as RbcData,
  AC: rbcAcRaw as RbcData,
}
const ICMS_ST_BY_PERFIL: Record<EstadoDestino, Record<string, StInfo>> = {
  RO: icmsStRoRaw as Record<string, StInfo>,
  AC: icmsStAcRaw as Record<string, StInfo>,
}
const RBC_NCM_SET_BY_PERFIL: Record<EstadoDestino, Set<string>> = {
  RO: new Set(RBC_BY_PERFIL.RO.rbcNcms),
  AC: new Set(RBC_BY_PERFIL.AC.rbcNcms),
}

/** Remove tudo que não for dígito — a planilha usa o NCM "cru" para os lookups. */
export function normalizeNcm(raw: string): string {
  return (raw || '').replace(/\D/g, '')
}

/** Reproduz TRUNC(valor, 2) do Excel (trunca, não arredonda). */
function truncar2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.trunc((value + Number.EPSILON) * 100) / 100
}

const ALIQ_ICMS_RO_NORMAL = 0.195
const ALIQ_ICMS_RO_RBC = 0.056
const ALIQ_ICMS_ST_RO = 0.195
const PIS_RATE = 0.0165
const COFINS_RATE = 0.076
const BASE_REDUZIDA_STRBC = 0.2872

export interface NcmInfo {
  ncm: string
  isRbcElegivel: boolean
  isSTemRO: boolean
  isMonoPisCofins: boolean
  stInfo: StInfo | null
}

/** Informações de classificação de um NCM, sem depender de estado/valores. */
export function getNcmInfo(ncmRaw: string, perfil: EstadoDestino = 'RO'): NcmInfo {
  const ncm = normalizeNcm(ncmRaw)
  const stInfo = ICMS_ST_BY_PERFIL[perfil][ncm] ?? null
  return {
    ncm,
    isRbcElegivel: RBC_NCM_SET_BY_PERFIL[perfil].has(ncm),
    isSTemRO: !!stInfo,
    isMonoPisCofins: !!pisCofinsMono[ncm],
    stInfo,
  }
}

/**
 * Calcula o resultado completo (custo, impostos, markup e preço de venda)
 * para um produto com uma determinada configuração de formação de preço.
 *
 * Espelha, coluna a coluna, a lógica da aba "Analise" da planilha original
 * (colunas K a BE), mantendo os mesmos resultados matemáticos.
 */
export function calculateItem(product: ProductInput, pricing: PricingConfig): CalculationResult {
  const perfil = product.perfil ?? 'RO'
  const rbcData = RBC_BY_PERFIL[perfil]
  const info = getNcmInfo(product.ncm, perfil)
  const qtd = Number(product.qtd) || 0
  const valorUnt = Number(product.valorUnt) || 0

  const X = qtd * valorUnt // Vlr Prod
  const T = X * (Number(product.freteRate) || 0) // Frete da NFE
  const V = Number(product.outrasDespesas) || 0
  const W = Number(product.desconto) || 0
  const Y = Number(product.ipi) || 0
  const Z = Number(product.freteAdicional) || 0
  const AA = Number(product.credIcmsFrete) || 0
  const U = Number(product.stRetido) || 0

  // --- Classificação ICMS (coluna AB) -------------------------------------
  let classificacaoIcms: ClassificacaoIcms
  if (U > 0) classificacaoIcms = 'ST RET'
  else if (info.isSTemRO) classificacaoIcms = 'ST'
  else if (info.isRbcElegivel) classificacaoIcms = 'RBC'
  else classificacaoIcms = 'Normal'

  const ehSTparaCusto = classificacaoIcms === 'ST' || classificacaoIcms === 'ST RET' // AE
  const ehComboSTRBC = classificacaoIcms === 'ST' && info.isRbcElegivel // AD = "STRBC"

  // --- Alíquotas interestaduais (coluna Q) --------------------------------
  const aliqInterNormal = rbcData.rateNormal[product.estadoOrigem] ?? 0
  const aliqInterRbc = rbcData.rateRbc[product.estadoOrigem] ?? 0

  // --- Crédito de ICMS da compra (coluna R) -------------------------------
  let icmsCreditoCompra: number
  if (product.estadoOrigem === perfil && classificacaoIcms === 'ST') {
    icmsCreditoCompra = 0
  } else if (info.isRbcElegivel) {
    icmsCreditoCompra = X * aliqInterRbc
  } else {
    icmsCreditoCompra = X * aliqInterNormal
  }

  // --- MVA ajustada (coluna AJ) --------------------------------------------
  let mva: number | null = null
  if (classificacaoIcms === 'ST' && info.stInfo) {
    if (Math.abs(aliqInterNormal - 0.12) < 1e-9) mva = info.stInfo.mva12
    else if (Math.abs(aliqInterNormal - 0.07) < 1e-9) mva = info.stInfo.mva07
    else if (Math.abs(aliqInterNormal - 0.04) < 1e-9) mva = info.stInfo.mva04
  }

  // --- Base de cálculo do ST (coluna AI) -----------------------------------
  let baseSubstituicao: number | null = null
  if (classificacaoIcms === 'ST' && mva !== null) {
    baseSubstituicao = ehComboSTRBC
      ? ((T + V + X + Y - W) * BASE_REDUZIDA_STRBC + Z) * (1 + mva)
      : (T + V + X + Y + Z - W) * (1 + mva)
  }

  // --- ICMS Substituição (coluna AK) ---------------------------------------
  let icmsSubstituicao: number
  if (product.estadoOrigem === perfil) {
    icmsSubstituicao = 0
  } else if (classificacaoIcms === 'ST RET') {
    icmsSubstituicao = U
  } else {
    icmsSubstituicao = (baseSubstituicao ?? 0) * ALIQ_ICMS_ST_RO - (icmsCreditoCompra + AA)
  }

  // --- PIS/COFINS (colunas AF, AG, AH) -------------------------------------
  const classificacaoPisCofins: ClassificacaoPisCofins = info.isMonoPisCofins ? 'Mono' : 'Poli'
  const pisRate = info.isMonoPisCofins ? 0 : PIS_RATE
  const cofinsRate = info.isMonoPisCofins ? 0 : COFINS_RATE

  // --- Custo final (coluna AL) ----------------------------------------------
  const baseCreditoPisCofins = T + V + X - W
  const creditoPis = baseCreditoPisCofins * pisRate
  const creditoCofins = baseCreditoPisCofins * cofinsRate
  const custoAntesST = T + V + X + Y + Z - W - (creditoPis + creditoCofins)
  const custoFinalTotal = ehSTparaCusto
    ? custoAntesST + icmsSubstituicao
    : custoAntesST - (icmsCreditoCompra + AA)

  const custoUnitario = qtd > 0 ? custoFinalTotal / qtd : 0

  // --- Alíquota efetiva de ICMS RO na venda (coluna BE) ---------------------
  let icmsRoRate = 0
  if (classificacaoIcms === 'Normal') icmsRoRate = ALIQ_ICMS_RO_NORMAL
  else if (classificacaoIcms === 'RBC') icmsRoRate = ALIQ_ICMS_RO_RBC

  // --- CMV e Markup (colunas BB, BC) -----------------------------------------
  const somaPercentuais =
    pricing.impFedPct +
    pricing.outrosPct +
    pricing.comissaoPct +
    pricing.custoFixoPct +
    pricing.lucroPct +
    pisRate +
    cofinsRate +
    icmsRoRate
  const cmvFracao = 1 - somaPercentuais
  const viavel = cmvFracao > 0
  const markupMultiplicador = viavel ? 1 / cmvFracao : 0

  // --- Preço de venda (colunas AR, AN) ---------------------------------------
  const precoVendaTotal = viavel ? truncar2(custoFinalTotal * markupMultiplicador) : 0
  const precoVendaUnitario = qtd > 0 ? precoVendaTotal / qtd : 0

  const breakdown = {
    impFed: precoVendaTotal * pricing.impFedPct,
    outros: precoVendaTotal * pricing.outrosPct,
    comissao: precoVendaTotal * pricing.comissaoPct,
    custoFixo: precoVendaTotal * pricing.custoFixoPct,
    lucro: precoVendaTotal * pricing.lucroPct,
    pis: precoVendaTotal * pisRate,
    cofins: precoVendaTotal * cofinsRate,
    icmsRo: precoVendaTotal * icmsRoRate,
  }

  // --- Indexador (coluna BD) ---------------------------------------------------
  const baseIndexador = T + V + X + Y - W
  const indexador = baseIndexador !== 0 ? precoVendaTotal / baseIndexador : null

  return {
    classificacaoIcms,
    classificacaoPisCofins,
    isRbcElegivel: info.isRbcElegivel,
    vlrProduto: X,
    freteCalculado: T,
    baseSubstituicao,
    mva,
    icmsSubstituicao,
    icmsCreditoCompra,
    custoFinalTotal,
    custoUnitario,
    cmvFracao,
    markupMultiplicador,
    viavel,
    precoVendaTotal,
    precoVendaUnitario,
    indexador,
    breakdown,
  }
}
