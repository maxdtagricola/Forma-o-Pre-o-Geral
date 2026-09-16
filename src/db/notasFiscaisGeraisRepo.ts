import { dbDelete, dbGet, dbGetAll, dbPut } from './db'
import { makeId } from '../utils'
import { NOTA_FISCAL_STATUSES } from '../types'
import type { NotaFiscal, NotaFiscalStatus } from '../types'

// Mesmo modelo de dado da aba "Transferências Fiscais" (mesmo tipo NotaFiscal), mas guardado
// numa coleção própria no servidor — são registros independentes, não a mesma lista.
const STORE_NOTAS_FISCAIS_GERAIS = 'notasFiscaisGerais'

export async function listNotasFiscaisGerais(): Promise<NotaFiscal[]> {
  const all = await dbGetAll<NotaFiscal>(STORE_NOTAS_FISCAIS_GERAIS)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveNotaFiscalGeral(
  data: Omit<NotaFiscal, 'id' | 'criadoPor' | 'createdAt' | 'status' | 'statusHistory'>,
  criadoPor: string,
  existingId?: string,
  statusInicial?: NotaFiscalStatus,
): Promise<NotaFiscal> {
  const existente = existingId ? await dbGet<NotaFiscal>(STORE_NOTAS_FISCAIS_GERAIS, existingId) : undefined
  const now = Date.now()
  const status = existente?.status ?? statusInicial ?? NOTA_FISCAL_STATUSES[0]
  const nota: NotaFiscal = {
    id: existingId ?? makeId(),
    ...data,
    status,
    statusHistory: existente?.statusHistory ?? [{ status, changedAt: now }],
    criadoPor: existente?.criadoPor ?? criadoPor,
    createdAt: existente?.createdAt ?? now,
  }
  await dbPut(STORE_NOTAS_FISCAIS_GERAIS, nota)
  return nota
}

export async function updateNotaFiscalGeralStatus(id: string, novoStatus: NotaFiscalStatus): Promise<NotaFiscal> {
  const atual = await dbGet<NotaFiscal>(STORE_NOTAS_FISCAIS_GERAIS, id)
  if (!atual) throw new Error('Nota fiscal não encontrada no servidor.')
  const atualizada: NotaFiscal = {
    ...atual,
    status: novoStatus,
    statusHistory: [...atual.statusHistory, { status: novoStatus, changedAt: Date.now() }],
  }
  await dbPut(STORE_NOTAS_FISCAIS_GERAIS, atualizada)
  return atualizada
}

export async function deleteNotaFiscalGeral(id: string): Promise<void> {
  await dbDelete(STORE_NOTAS_FISCAIS_GERAIS, id)
}
