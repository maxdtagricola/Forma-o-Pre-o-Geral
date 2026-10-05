import type { QuoteRecord } from './types'

// -----------------------------------------------------------------------
// Retorno do cliente: cotação enviada há 7 dias (corridos) ou mais e ainda
// em ENVIADO — quem enviou é avisado pra atualizar: se fechou, segue pro
// pedido de compra; se não fechou, arquiva com o motivo.
// -----------------------------------------------------------------------

export const DIAS_PARA_RETORNO = 7
const DIA = 24 * 60 * 60 * 1000

/** Quando a cotação foi enviada ao cliente (a última vez que passou pra ENVIADO). */
export function enviadaEm(r: QuoteRecord): number {
  for (let i = r.statusHistory.length - 1; i >= 0; i--) {
    if (r.statusHistory[i].status === 'ENVIADO') return r.statusHistory[i].changedAt
  }
  return r.updatedAt
}

/** Cotações do usuário (ele enviou: é o responsável) paradas em ENVIADO há DIAS_PARA_RETORNO dias ou mais,
 * das mais antigas pras mais novas. */
export function cotacoesEsperandoRetorno(cotacoes: QuoteRecord[], usuario: string, agora: number = Date.now()): QuoteRecord[] {
  return cotacoes
    .filter((r) => r.status === 'ENVIADO' && r.responsavelStatus === usuario && agora - enviadaEm(r) >= DIAS_PARA_RETORNO * DIA)
    .sort((a, b) => enviadaEm(a) - enviadaEm(b))
}

/** Dias corridos desde o envio. */
export function diasDesdeOEnvio(r: QuoteRecord, agora: number = Date.now()): number {
  return Math.floor((agora - enviadaEm(r)) / DIA)
}
