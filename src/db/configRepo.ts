import { dbGet, dbPut } from './db'

const STORE_CONFIG = 'configuracoes'
const DOC_STATUS_COLORS = 'statusColors'

interface StatusColorsDoc {
  id: string
  cores: Record<string, string>
}

export async function getStatusColors(): Promise<Record<string, string>> {
  const doc = await dbGet<StatusColorsDoc>(STORE_CONFIG, DOC_STATUS_COLORS)
  return doc?.cores ?? {}
}

export async function setStatusColor(status: string, cor: string): Promise<Record<string, string>> {
  const atuais = await getStatusColors()
  const cores = { ...atuais, [status]: cor }
  await dbPut(STORE_CONFIG, { id: DOC_STATUS_COLORS, cores })
  return cores
}
