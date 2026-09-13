import { dbGet, dbGetAll, dbPut } from './db'
import { makeId } from '../utils'
import type { RbcData, StInfo } from '../calc/calculator'
import type { EstadoDestino } from '../types'

const STORE_CONFIG = 'configuracoes'
const STORE_PLANILHAS = 'planilhas'
const DOC_STATUS_COLORS = 'statusColors'
const DOC_PRICING_GLOBAL = 'formacaoPrecoGlobal'
const DOC_PLANILHA_ATIVA = 'planilhaAtiva'

interface StatusColorsDoc {
  id: string
  cores: Record<string, string>
}

export async function getStatusColors(): Promise<Record<string, string>> {
  const doc = await dbGet<StatusColorsDoc>(STORE_CONFIG, DOC_STATUS_COLORS)
  return doc?.cores ?? {}
}

export async function setStatusColor(status: string, cor: string): Promise<Record<string, string>> {
  const atuais = await getStatusColors()
  const cores = { ...atuais, [status]: cor }
  await dbPut(STORE_CONFIG, { id: DOC_STATUS_COLORS, cores })
  return cores
}

// ---------------------------------------------------------------------------
// Formação de preço global — imposto federal, comissão e custo fixo passam a
// valer pra todas as cotações, em vez de serem configurados item a item.
// ---------------------------------------------------------------------------
export interface PricingGlobal {
  impFedPct: number
  comissaoPct: number
  custoFixoPct: number
}

export const DEFAULT_PRICING_GLOBAL: PricingGlobal = {
  impFedPct: 0.03,
  comissaoPct: 0.04,
  custoFixoPct: 0.1,
}

interface PricingGlobalDoc extends PricingGlobal {
  id: string
}

export async function getPricingGlobal(): Promise<PricingGlobal> {
  const doc = await dbGet<PricingGlobalDoc>(STORE_CONFIG, DOC_PRICING_GLOBAL)
  return doc ? { impFedPct: doc.impFedPct, comissaoPct: doc.comissaoPct, custoFixoPct: doc.custoFixoPct } : DEFAULT_PRICING_GLOBAL
}

export async function setPricingGlobal(valores: PricingGlobal): Promise<void> {
  await dbPut(STORE_CONFIG, { id: DOC_PRICING_GLOBAL, ...valores })
}

// ---------------------------------------------------------------------------
// Planilhas de markup importadas — cada "Salvar nova planilha" cria um
// registro permanente (histórico), e um ponteiro separado guarda qual
// planilha está ativa em cada perfil (estado).
// ---------------------------------------------------------------------------
export interface PlanilhaImportada {
  id: string
  perfil: EstadoDestino
  nomeArquivo: string
  importadoPor: string
  importadoEm: number
  rbc: RbcData
  icmsSt: Record<string, StInfo>
}

export async function listPlanilhas(): Promise<PlanilhaImportada[]> {
  const all = await dbGetAll<PlanilhaImportada>(STORE_PLANILHAS)
  return all.sort((a, b) => b.importadoEm - a.importadoEm)
}

export async function salvarPlanilha(
  dados: Omit<PlanilhaImportada, 'id' | 'importadoEm'>,
): Promise<PlanilhaImportada> {
  const registro: PlanilhaImportada = { ...dados, id: makeId(), importadoEm: Date.now() }
  await dbPut(STORE_PLANILHAS, registro)
  return registro
}

interface PlanilhaAtivaDoc {
  id: string
  porPerfil: Partial<Record<EstadoDestino, string>>
}

export async function getPlanilhaAtivaIds(): Promise<Partial<Record<EstadoDestino, string>>> {
  const doc = await dbGet<PlanilhaAtivaDoc>(STORE_CONFIG, DOC_PLANILHA_ATIVA)
  return doc?.porPerfil ?? {}
}

export async function setPlanilhaAtivaId(perfil: EstadoDestino, planilhaId: string): Promise<void> {
  const atuais = await getPlanilhaAtivaIds()
  const porPerfil = { ...atuais, [perfil]: planilhaId }
  await dbPut(STORE_CONFIG, { id: DOC_PLANILHA_ATIVA, porPerfil })
}
