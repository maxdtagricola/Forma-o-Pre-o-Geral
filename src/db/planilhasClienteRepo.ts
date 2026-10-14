import { dbDelete, dbGet, dbPut } from './db'
import type { QuoteRecord } from '../types'

// A planilha original do cliente (o arquivo em base64, de dezenas a centenas de KB) fica num registro
// só dela, com o mesmo id da cotação — a cotação guarda só o nome do arquivo. Dentro da cotação, toda
// tela que lista as cotações baixava todas as planilhas junto (eram 91% do tamanho da lista).
const STORE_PLANILHAS_CLIENTE = 'planilhasCliente'

export interface PlanilhaClienteArquivo {
  nomeArquivo: string
  conteudoBase64: string
}

interface PlanilhaClienteDoc extends PlanilhaClienteArquivo {
  id: string
}

export async function gravarPlanilhaCliente(idCotacao: string, planilha: PlanilhaClienteArquivo): Promise<void> {
  await dbPut<PlanilhaClienteDoc>(STORE_PLANILHAS_CLIENTE, { id: idCotacao, nomeArquivo: planilha.nomeArquivo, conteudoBase64: planilha.conteudoBase64 })
}

/** O arquivo da planilha da cotação: de dentro dela (cotação ainda no formato antigo) ou do registro à parte. */
export async function lerPlanilhaCliente(
  idCotacao: string,
  info: QuoteRecord['planilhaOriginal'],
): Promise<PlanilhaClienteArquivo | undefined> {
  if (!info) return undefined
  if (info.conteudoBase64) return { nomeArquivo: info.nomeArquivo, conteudoBase64: info.conteudoBase64 }
  const doc = await dbGet<PlanilhaClienteDoc>(STORE_PLANILHAS_CLIENTE, idCotacao, { semCache: true })
  return doc ? { nomeArquivo: doc.nomeArquivo, conteudoBase64: doc.conteudoBase64 } : undefined
}

export async function excluirPlanilhaCliente(idCotacao: string): Promise<void> {
  await dbDelete(STORE_PLANILHAS_CLIENTE, idCotacao)
}
