import { QUOTE_STATUSES } from './types'

// paleta categórica fixa (8 tons validados) — mesma usada no gráfico do Dashboard
export const PALETA_CATEGORICA = [
  '#2a78d6', // azul
  '#eb6834', // laranja
  '#1baf7a', // água
  '#eda100', // amarelo
  '#e87ba4', // magenta
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // vermelho
]
export const COR_OUTROS = '#c3c2b7'

export function corPadraoDoStatus(status: string): string {
  const indice = QUOTE_STATUSES.indexOf(status as (typeof QUOTE_STATUSES)[number])
  return PALETA_CATEGORICA[indice % PALETA_CATEGORICA.length]
}

/** Escolhe texto branco ou escuro pra contrastar com a cor de fundo. */
export function corTexto(hexFundo: string): string {
  const r = parseInt(hexFundo.slice(1, 3), 16)
  const g = parseInt(hexFundo.slice(3, 5), 16)
  const b = parseInt(hexFundo.slice(5, 7), 16)
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminancia > 0.6 ? '#0b0b0b' : '#ffffff'
}
