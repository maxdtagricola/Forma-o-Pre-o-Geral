import { dbDelete, dbGetAll, dbPut } from './db'
import { makeId } from '../utils'
import type { Fornecedor } from '../types'

const STORE_FORNECEDORES = 'fornecedores'

export async function listFornecedores(): Promise<Fornecedor[]> {
  const all = await dbGetAll<Fornecedor>(STORE_FORNECEDORES)
  return all.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function saveFornecedor(data: Omit<Fornecedor, 'id'>, existingId?: string): Promise<Fornecedor> {
  const fornecedor: Fornecedor = { id: existingId ?? makeId(), ...data }
  await dbPut(STORE_FORNECEDORES, fornecedor)
  return fornecedor
}

export async function deleteFornecedor(id: string): Promise<void> {
  await dbDelete(STORE_FORNECEDORES, id)
}
