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

/** Cor padrão pra um status, pela posição dele numa lista — mesma paleta fixa pra todos os fluxos de status do app. */
export function corPadraoDoStatus(status: string, lista: readonly string[] = QUOTE_STATUSES): string {
  const indice = lista.indexOf(status)
  return PALETA_CATEGORICA[(indice === -1 ? 0 : indice) % PALETA_CATEGORICA.length]
}

/** Escolhe texto branco ou escuro pra contrastar com a cor de fundo. */
export function corTexto(hexFundo: string): string {
  const r = parseInt(hexFundo.slice(1, 3), 16)
  const g = parseInt(hexFundo.slice(3, 5), 16)
  const b = parseInt(hexFundo.slice(5, 7), 16)
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminancia > 0.6 ? '#0b0b0b' : '#ffffff'
}
