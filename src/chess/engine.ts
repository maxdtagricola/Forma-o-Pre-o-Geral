import { Chess } from 'chess.js'
import { buscarNoLivro, type LivroDeAberturas } from './pgnBook'

const VALOR_PECA: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

function avaliarMaterial(chess: Chess): number {
  let pontos = 0
  for (const linha of chess.board()) {
    for (const casa of linha) {
      if (!casa) continue
      const valor = VALOR_PECA[casa.type] ?? 0
      pontos += casa.color === 'w' ? valor : -valor
    }
  }
  return pontos
}

/** Busca negamax com poda alfa-beta — profundidade pequena, mas evita jogadas que perdem peça de graça. */
function negamax(chess: Chess, profundidade: number, alfa: number, beta: number, sinal: 1 | -1): number {
  if (chess.isCheckmate()) return sinal * -1000
  if (chess.isDraw() || chess.isStalemate()) return 0
  if (profundidade === 0) return sinal * avaliarMaterial(chess)

  let melhor = -Infinity
  for (const san of chess.moves()) {
    chess.move(san)
    const valor = -negamax(chess, profundidade - 1, -beta, -alfa, (sinal * -1) as 1 | -1)
    chess.undo()
    if (valor > melhor) melhor = valor
    if (melhor > alfa) alfa = melhor
    if (alfa >= beta) break
  }
  return melhor
}

function melhorJogadaPorBusca(chess: Chess, profundidade = 2): string | null {
  const jogadas = chess.moves()
  if (jogadas.length === 0) return null

  const sinal: 1 | -1 = chess.turn() === 'w' ? 1 : -1
  let melhorMove = jogadas[0]
  let melhorValor = -Infinity

  for (const san of jogadas) {
    chess.move(san)
    const valor = -negamax(chess, profundidade - 1, -Infinity, Infinity, (sinal * -1) as 1 | -1)
    chess.undo()
    if (valor > melhorValor) {
      melhorValor = valor
      melhorMove = san
    }
  }

  return melhorMove
}

function escolherPeso<T extends { count: number }>(entradas: T[]): T {
  const total = entradas.reduce((s, e) => s + e.count, 0)
  let r = Math.random() * total
  for (const e of entradas) {
    r -= e.count
    if (r <= 0) return e
  }
  return entradas[entradas.length - 1]
}

/**
 * Escolhe o lance da máquina: primeiro tenta a posição atual no livro de partidas de referência
 * (games.pgn); se a posição não aparece no livro, cai pra uma busca própria (material + 2 lances à frente).
 */
export function escolherJogadaDaMaquina(chess: Chess, livro: LivroDeAberturas): string | null {
  const entradasLivro = buscarNoLivro(chess, livro)
  if (entradasLivro && entradasLivro.length > 0) {
    return escolherPeso(entradasLivro).move
  }
  return melhorJogadaPorBusca(chess, 2)
}
