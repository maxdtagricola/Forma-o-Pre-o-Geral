const KEY = 'xadrezJogadorAtual'

/** Nome do jogador usado por padrão neste aparelho — perguntado uma vez e lembrado depois. */
export function getJogadorAtual(): string | null {
  const nome = localStorage.getItem(KEY)
  return nome && nome.trim() ? nome : null
}

export function setJogadorAtual(nome: string): void {
  localStorage.setItem(KEY, nome.trim())
}

export function limparJogadorAtual(): void {
  localStorage.removeItem(KEY)
}
