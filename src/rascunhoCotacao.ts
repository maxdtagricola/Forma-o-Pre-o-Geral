// -----------------------------------------------------------------------
// Rede de segurança contra queda de energia / travamento / fechamento
// acidental: enquanto uma cotação está aberta, o estado em edição vai
// sendo salvo no localStorage (debounced) — sem precisar do servidor.
// Se o app abrir de novo e achar um rascunho, oferece recuperar antes de
// perder qualquer coisa. Só existe UM rascunho por vez (a cotação aberta
// mais recentemente).
// -----------------------------------------------------------------------
import type { PreRegistroItem, QuoteItem, QuoteStatus, TipoReferencia } from './types'

const CHAVE_RASCUNHO = 'rascunhoCotacaoAtual'

export interface RascunhoCotacao {
  editingQuoteId: string
  codigo: string
  vendedor: string
  tipoReferencia: TipoReferencia
  cliente: string
  maquina: string
  empresaId?: string
  items: QuoteItem[]
  activeItemId: string
  activeStatus: QuoteStatus
  activeResponsavel: string
  preRegistroItems: PreRegistroItem[]
  planilhaOriginal?: { nomeArquivo: string; conteudoBase64: string }
  salvoEm: number
}

export function salvarRascunho(dados: Omit<RascunhoCotacao, 'salvoEm'>): void {
  try {
    const rascunho: RascunhoCotacao = { ...dados, salvoEm: Date.now() }
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(rascunho))
  } catch {
    // localStorage cheio ou indisponível — o rascunho é só uma rede de segurança extra
  }
}

export function lerRascunho(): RascunhoCotacao | undefined {
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO)
    return bruto ? (JSON.parse(bruto) as RascunhoCotacao) : undefined
  } catch {
    return undefined
  }
}

export function limparRascunho(): void {
  try {
    localStorage.removeItem(CHAVE_RASCUNHO)
  } catch {
    // sem problema — um rascunho antigo ficar pra trás não tem efeito prático
  }
}
