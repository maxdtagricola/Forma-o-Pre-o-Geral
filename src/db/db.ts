// -----------------------------------------------------------------------
// Camada de armazenamento: fala com o servidor rodando no celular
// (Termux) em vez de usar o IndexedDB do navegador. A interface pública
// (dbPut, dbGetAll, dbGet, dbDelete) é a mesma de antes, então o resto
// do app (analysesRepo.ts) não precisa mudar nada.
// -----------------------------------------------------------------------
export const STORE_ANALISES = 'analises'

// Endereço do servidor no celular. Se o IP do celular mudar (acontece
// quando ele reconecta no Wi-Fi), não precisa editar o código: abra o
// console do navegador (F12) e rode:
//   localStorage.setItem('serverUrl', 'http://NOVO_IP:3000')
// e recarregue a página.
const DEFAULT_SERVER_URL = 'http://192.168.28.101:3000'

export function getServerUrl(): string {
  return localStorage.getItem('serverUrl') || DEFAULT_SERVER_URL
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${getServerUrl()}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new Error(
      `Não foi possível conectar ao servidor (${getServerUrl()}). Verifique se o celular está ligado, com o servidor rodando no Termux, e na mesma rede Wi-Fi do computador.`,
    )
  }
  if (res.status === 404) {
    throw new Error('not-found')
  }
  if (!res.ok) {
    throw new Error(`Erro do servidor (${res.status}): ${await res.text()}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function dbPut<T extends { id: string }>(storeName: string, value: T): Promise<void> {
  await request(`/${storeName}/${value.id}`, {
    method: 'PUT',
    body: JSON.stringify(value),
  })
}

export async function dbGetAll<T>(storeName: string): Promise<T[]> {
  return request<T[]>(`/${storeName}`)
}

export async function dbGet<T>(storeName: string, id: string): Promise<T | undefined> {
  try {
    return await request<T>(`/${storeName}/${id}`)
  } catch (err) {
    if (err instanceof Error && err.message === 'not-found') return undefined
    throw err
  }
}

export async function dbDelete(storeName: string, id: string): Promise<void> {
  await request(`/${storeName}/${id}`, { method: 'DELETE' })
}
