// -----------------------------------------------------------------------
// Qual dos dois modos de acesso está ativo neste aparelho — 'admin' (acesso
// completo, um dos ADMINS) ou 'jogador' (convidado, só vê a Tela Inicial).
// Guarda isso separado do nome em si (currentAdmin.ts / currentPlayer.ts)
// pra saber qual dos dois ler quando o app inicia.
// -----------------------------------------------------------------------
export type ModoSessao = 'admin' | 'jogador'

const KEY = 'modoSessao'

export function getModoSessao(): ModoSessao | null {
  const valor = localStorage.getItem(KEY)
  return valor === 'admin' || valor === 'jogador' ? valor : null
}

export function setModoSessao(modo: ModoSessao): void {
  localStorage.setItem(KEY, modo)
}

export function limparModoSessao(): void {
  localStorage.removeItem(KEY)
}
