import { dbDelete, dbGetAll, dbPut } from './db'
import { makeId } from '../utils'

const STORE_PARTIDAS = 'xadrezPartidas'

export type StatusPartidaXadrez = 'EM_ANDAMENTO' | 'FINALIZADA'

export interface PartidaXadrez {
  id: string
  /** Nome do jogador — é o que separa as partidas em "pastas" por jogador. */
  jogador: string
  /** PGN completo (histórico de lances) — reconstrói o tabuleiro inteiro ao carregar. */
  pgn: string
  status: StatusPartidaXadrez
  resultado?: string
  criadaEm: number
  atualizadaEm: number
}

export function novaPartida(jogador: string): PartidaXadrez {
  const agora = Date.now()
  return { id: makeId(), jogador, pgn: '', status: 'EM_ANDAMENTO', criadaEm: agora, atualizadaEm: agora }
}

export async function listPartidasXadrez(): Promise<PartidaXadrez[]> {
  const todas = await dbGetAll<PartidaXadrez>(STORE_PARTIDAS)
  return todas.sort((a, b) => b.atualizadaEm - a.atualizadaEm)
}

export async function listPartidasDoJogador(jogador: string): Promise<PartidaXadrez[]> {
  const todas = await listPartidasXadrez()
  return todas.filter((p) => p.jogador === jogador)
}

export async function salvarPartida(partida: PartidaXadrez): Promise<void> {
  await dbPut(STORE_PARTIDAS, partida)
}

export async function excluirPartida(id: string): Promise<void> {
  await dbDelete(STORE_PARTIDAS, id)
}

/** Exclui todas as partidas de um jogador — usado só em Configurações, com senha. */
export async function excluirPastaDoJogador(jogador: string): Promise<void> {
  const partidas = await listPartidasDoJogador(jogador)
  await Promise.all(partidas.map((p) => excluirPartida(p.id)))
}
