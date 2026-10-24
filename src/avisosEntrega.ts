import { chaveDoDia, diasUteisAte } from './diasUteis'
import { statusDe } from './statusConfig'
import type { QuoteRecord, QuoteStatus } from './types'

// -----------------------------------------------------------------------
// Aviso de entrega das notas: cada fornecedor de um pedido em transporte
// despacha com a nota dele e a previsão de entrega da transportadora —
// aqui saem as que já passaram da previsão, as que chegam hoje e as que
// chegam nos próximos dias úteis, pra notificação no canto da tela.
// -----------------------------------------------------------------------

/** A mercadoria ainda está a caminho (dá pra marcar a entrega no Pedido de Compra): de EM TRANSPORTE até
 * antes de ENTREGUE no fluxo — EM TRANSPORTE, CADASTRO DE PRODUTO, PARCIALMENTE ENTREGUE e os criados entre eles. */
export function estaACaminho(status: QuoteStatus): boolean {
  const lista = statusDe('cotacoes')
  const i = lista.indexOf(status)
  return status !== 'ARQUIVO' && i >= lista.indexOf('EM TRANSPORTE') && i < lista.indexOf('ENTREGUE')
}

/** Os status "a caminho", na ordem do fluxo. */
export function statusACaminho(): QuoteStatus[] {
  return statusDe('cotacoes').filter(estaACaminho)
}

/** ENTREGUE e o que vem depois no fluxo (CONFERIDO, FATURADO e os criados depois deles): a mercadoria já foi recebida. */
export function mercadoriaRecebida(status: QuoteStatus): boolean {
  const lista = statusDe('cotacoes')
  return status !== 'ARQUIVO' && lista.indexOf(status) >= lista.indexOf('ENTREGUE')
}

/** Até quantos dias úteis antes a previsão conta como "chega em breve". */
export const DIAS_UTEIS_ENTREGA_PROXIMA = 2

export type SituacaoEntrega = 'atrasada' | 'hoje' | 'proxima'

export interface AvisoEntrega {
  /** Cotação + fornecedor — identifica o aviso (cada fornecedor tem a nota dele). */
  chave: string
  cotacaoId: string
  codigo: string
  cliente: string
  /** "TOLEAGRI — PR" (fornecedor e estado de onde saiu). */
  fornecedor: string
  notaFiscal: string
  transportadora: string
  /** "AAAA-MM-DD" */
  previsao: string
  situacao: SituacaoEntrega
}

const ORDEM: Record<SituacaoEntrega, number> = { atrasada: 0, hoje: 1, proxima: 2 }

/** "TOLEAGRI|PR" (chave do transporte) → "TOLEAGRI — PR". */
function rotuloDoFornecedor(chave: string): string {
  if (chave === 'SEM FORNECEDOR') return 'Sem fornecedor'
  const [nome, uf] = chave.split('|')
  return uf ? `${nome} — ${uf}` : nome
}

/** Notas a caminho com a previsão de entrega vencida, pra hoje ou chegando — da mais atrasada pra
 * mais distante. Nota já entregue ou sem previsão informada não entra. */
export function avisosDeEntrega(quotes: QuoteRecord[], agora: number = Date.now()): AvisoEntrega[] {
  const hoje = chaveDoDia(new Date(agora))
  const avisos: AvisoEntrega[] = []
  for (const q of quotes) {
    if (!estaACaminho(q.status)) continue
    for (const [chaveFornecedor, t] of Object.entries(q.transportePorFornecedor ?? {})) {
      const previsao = t.previsaoEntrega ?? ''
      if (t.entregueEm || !/^\d{4}-\d{2}-\d{2}$/.test(previsao)) continue
      let situacao: SituacaoEntrega
      if (previsao < hoje) situacao = 'atrasada'
      else if (previsao === hoje) situacao = 'hoje'
      else {
        const [ano, mes, dia] = previsao.split('-').map(Number)
        if (diasUteisAte(new Date(ano, mes - 1, dia).getTime(), agora) > DIAS_UTEIS_ENTREGA_PROXIMA) continue
        situacao = 'proxima'
      }
      avisos.push({
        chave: `${q.id}|${chaveFornecedor}`,
        cotacaoId: q.id,
        codigo: q.codigo || 'sem código',
        cliente: q.cliente || 'sem cliente',
        fornecedor: rotuloDoFornecedor(chaveFornecedor),
        notaFiscal: t.numeroNotaFiscal.trim(),
        transportadora: t.transportadora.trim(),
        previsao,
        situacao,
      })
    }
  }
  return avisos.sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.previsao.localeCompare(b.previsao) || a.codigo.localeCompare(b.codigo))
}

/** Identifica o conjunto de avisos de hoje: dispensado o aviso, ele só volta quando isso muda (nota
 * nova na lista, nota que mudou de situação, ou outro dia). */
export function assinaturaDosAvisos(avisos: AvisoEntrega[], agora: number = Date.now()): string {
  return `${chaveDoDia(new Date(agora))}#${avisos.map((a) => `${a.chave}:${a.situacao}:${a.previsao}`).join(',')}`
}
