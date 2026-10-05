import { dbDelete, dbGetAll, dbPut } from './db'
import { makeId } from '../utils'
import type { Empresa } from '../types'

const STORE_EMPRESAS = 'empresas'

export async function listEmpresas(): Promise<Empresa[]> {
  const all = await dbGetAll<Empresa>(STORE_EMPRESAS)
  return all.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// gravar e excluir empresa pedem a senha de admin (conferida pelo servidor)
export async function saveEmpresa(data: Omit<Empresa, 'id'>, existingId: string | undefined, senhaAdmin: string): Promise<Empresa> {
  const empresa: Empresa = { id: existingId ?? makeId(), ...data }
  await dbPut(STORE_EMPRESAS, empresa, { senhaAdmin })
  return empresa
}

export async function deleteEmpresa(id: string, senhaAdmin: string): Promise<void> {
  await dbDelete(STORE_EMPRESAS, id, { senhaAdmin })
}
