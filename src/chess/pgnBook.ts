import { Chess } from 'chess.js'

export interface LivroEntrada {
  move: string
  count: number
}

export type LivroDeAberturas = Map<string, LivroEntrada[]>

/** Chave de posição — ignora o contador de lances (últimos dois campos do FEN), só compara tabuleiro/vez/roque/en passant. */
export function chavePosicao(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

function separarPartidasPgn(bruto: string): string[] {
  return bruto
    .split(/\r?\n(?=\s*\[Event\s)/)
    .map((g) => g.trim())
    .filter(Boolean)
}

/** Monta o livro de aberturas a partir de um arquivo PGN com várias partidas — cada posição vista aponta pros lances que realmente foram jogados a partir dela, com a frequência de cada um. */
export function montarLivroDeAberturas(pgnTexto: string): LivroDeAberturas {
  const livro: LivroDeAberturas = new Map()
  const partidas = separarPartidasPgn(pgnTexto)

  for (const partida of partidas) {
    try {
      const chess = new Chess()
      chess.loadPgn(partida, { strict: false })
      const lances = chess.history({ verbose: true })
      for (const lance of lances) {
        const chave = chavePosicao(lance.before)
        const lista = livro.get(chave) ?? []
        const existente = lista.find((e) => e.move === lance.san)
        if (existente) existente.count += 1
        else lista.push({ move: lance.san, count: 1 })
        livro.set(chave, lista)
      }
    } catch {
      // partida com formatação inválida no PGN — ignora e segue pras próximas
    }
  }

  return livro
}

export function buscarNoLivro(chess: Chess, livro: LivroDeAberturas): LivroEntrada[] | undefined {
  return livro.get(chavePosicao(chess.fen()))
}

let livroPromise: Promise<LivroDeAberturas> | null = null

/**
 * Carrega e monta o livro de aberturas a partir de /chess/games.pgn (pasta public/chess/games.pgn no projeto).
 * Enquanto esse arquivo não existir, retorna um livro vazio — a máquina passa a jogar só pela busca própria.
 */
export function carregarLivroDeAberturas(): Promise<LivroDeAberturas> {
  if (!livroPromise) {
    livroPromise = fetch(`${import.meta.env.BASE_URL}chess/games.pgn`)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('sem arquivo de referência'))))
      .then((texto) => montarLivroDeAberturas(texto))
      .catch(() => new Map())
  }
  return livroPromise
}
