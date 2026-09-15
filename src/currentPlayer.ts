const KEY = 'currentPlayer'

/** Nome de um jogador convidado — sem acesso de admin, só à Tela Inicial (xadrez). */
export function getCurrentPlayer(): string | null {
  const nome = localStorage.getItem(KEY)
  return nome && nome.trim() ? nome : null
}

export function setCurrentPlayer(nome: string): void {
  localStorage.setItem(KEY, nome.trim())
}

export function clearCurrentPlayer(): void {
  localStorage.removeItem(KEY)
}
