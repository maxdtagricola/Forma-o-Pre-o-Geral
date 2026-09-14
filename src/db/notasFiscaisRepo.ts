import { dbDelete, dbGet, dbGetAll, dbPut } from './db'
import { makeId } from '../utils'
import { NOTA_FISCAL_STATUSES } from '../types'
import type { NotaFiscal, NotaFiscalStatus } from '../types'

const STORE_NOTAS_FISCAIS = 'notasFiscais'

export async function listNotasFiscais(): Promise<NotaFiscal[]> {
  const all = await dbGetAll<NotaFiscal>(STORE_NOTAS_FISCAIS)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveNotaFiscal(
  data: Omit<NotaFiscal, 'id' | 'criadoPor' | 'createdAt' | 'status' | 'statusHistory'>,
  criadoPor: string,
  existingId?: string,
  statusInicial?: NotaFiscalStatus,
): Promise<NotaFiscal> {
  const existente = existingId ? await dbGet<NotaFiscal>(STORE_NOTAS_FISCAIS, existingId) : undefined
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
  await dbPut(STORE_NOTAS_FISCAIS, nota)
  return nota
}

export async function updateNotaFiscalStatus(id: string, novoStatus: NotaFiscalStatus): Promise<NotaFiscal> {
  const atual = await dbGet<NotaFiscal>(STORE_NOTAS_FISCAIS, id)
  if (!atual) throw new Error('Nota fiscal não encontrada no servidor.')
  const atualizada: NotaFiscal = {
    ...atual,
    status: novoStatus,
    statusHistory: [...atual.statusHistory, { status: novoStatus, changedAt: Date.now() }],
  }
  await dbPut(STORE_NOTAS_FISCAIS, atualizada)
  return atualizada
}

export async function deleteNotaFiscal(id: string): Promise<void> {
  await dbDelete(STORE_NOTAS_FISCAIS, id)
}
