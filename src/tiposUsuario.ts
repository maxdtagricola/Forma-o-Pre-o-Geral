import { dbGet, dbPut } from './db/db'
import { ABAS_PADRAO, salvarAbasDoUsuario } from './abasPermitidas'
import { salvarPermissoesStatusDoUsuario } from './statusConfig'
import { salvarTelaInicialDoUsuario, type ParteTelaInicial } from './telaInicialPorUsuario'
import type { TabKey } from './components/Layout'
import type { PapelUsuario } from './sessaoUsuario'

// Tipos de usuário (ex.: "Vendedor", "Comprador"): um modelo de função + abas + status permitidos + o
// que aparece na Tela Inicial, que o Max monta em Configurações › Tipos de usuário e reaproveita ao
// cadastrar alguém (ou copia pra quem já existe). É uma cópia: mudar o tipo depois não muda quem já
// foi cadastrado com ele.

export interface PermissoesDoUsuario {
  abas: TabKey[]
  /** null = pode mudar pra qualquer status (inclusive os criados depois). */
  statusCotacoes: string[] | null
  statusNotas: string[] | null
  /** null (ou ausente, nos tipos gravados antes) = vê a Tela Inicial inteira. */
  telaInicial?: ParteTelaInicial[] | null
}

export interface TipoUsuario extends PermissoesDoUsuario {
  id: string
  nome: string
  papel: PapelUsuario
}

const STORE_CONFIG = 'configuracoes'
const DOC = 'tiposUsuario'

export const PERMISSOES_PADRAO: PermissoesDoUsuario = { abas: ABAS_PADRAO, statusCotacoes: null, statusNotas: null, telaInicial: null }

export async function getTiposUsuario(): Promise<TipoUsuario[]> {
  const doc = await dbGet<{ id: string; lista?: TipoUsuario[] }>(STORE_CONFIG, DOC)
  return doc?.lista ?? []
}

/** Só o Max (o servidor recusa os outros). */
export async function salvarTiposUsuario(lista: TipoUsuario[]): Promise<void> {
  await dbPut(STORE_CONFIG, { id: DOC, lista })
}

/** Grava as abas, os status e a Tela Inicial de um usuário (do jeito que vieram do editor ou de um tipo). */
export async function aplicarPermissoes(login: string, p: PermissoesDoUsuario): Promise<void> {
  await salvarAbasDoUsuario(login, p.abas)
  await salvarTelaInicialDoUsuario(login, p.telaInicial ?? null)
  const semRestricao = p.statusCotacoes === null && p.statusNotas === null
  await salvarPermissoesStatusDoUsuario(
    login,
    semRestricao
      ? null
      : { ...(p.statusCotacoes ? { cotacoes: p.statusCotacoes } : {}), ...(p.statusNotas ? { notas: p.statusNotas } : {}) },
  )
}

/** As mesmas permissões? (pra dizer de que tipo um usuário é) */
export function mesmasPermissoes(a: PermissoesDoUsuario, b: PermissoesDoUsuario): boolean {
  const igual = (x: readonly string[] | null, y: readonly string[] | null) =>
    x === null || y === null ? x === y : x.length === y.length && [...x].sort().join('|') === [...y].sort().join('|')
  return (
    igual(a.abas, b.abas) &&
    igual(a.statusCotacoes, b.statusCotacoes) &&
    igual(a.statusNotas, b.statusNotas) &&
    igual(a.telaInicial ?? null, b.telaInicial ?? null)
  )
}
