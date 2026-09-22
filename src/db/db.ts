// -----------------------------------------------------------------------
// Camada de armazenamento: fala com o servidor rodando no celular
// (Termux) em vez de usar o IndexedDB do navegador. A interface pública
// (dbPut, dbGetAll, dbGet, dbDelete) é a mesma de antes, então o resto
// do app (analysesRepo.ts) não precisa mudar nada.
//
// Cache: toda leitura bem-sucedida fica guardada no localStorage. Se uma
// leitura futura não conseguir alcançar o servidor (celular desligado,
// Tailscale caído etc.), o app usa o último dado conhecido em vez de
// simplesmente quebrar — assim o que já foi carregado uma vez continua
// disponível. Não é usado pra respostas de erro do próprio servidor (404,
// 500...), só quando a conexão falha de verdade.
// -----------------------------------------------------------------------
export const STORE_ANALISES = 'analises'

// Endereço do servidor no celular, pela rede privada do Tailscale — esse IP
// (100.x.y.z) fica fixo independente de trocas de Wi-Fi ou quedas de energia,
// desde que o celular continue com o Tailscale conectado na mesma conta.
// Se precisar trocar por outro motivo, não precisa editar o código: abra o
// console do navegador (F12) e rode:
//   localStorage.setItem('serverUrl', 'http://NOVO_IP:3000')
// e recarregue a página.
const DEFAULT_SERVER_URL = 'http://100.112.41.57:3000'

export function getServerUrl(): string {
  return localStorage.getItem('serverUrl') || DEFAULT_SERVER_URL
}

/** Lançado só quando a requisição nem chega a sair (rede fora do ar) — nunca por causa de uma resposta de erro do servidor. */
class ServidorInalcancavelError extends Error {}

const CACHE_PREFIX = 'cache:'

function chaveCache(path: string): string {
  return `${CACHE_PREFIX}${path}`
}

function lerCache<T>(path: string): T | undefined {
  try {
    const bruto = localStorage.getItem(chaveCache(path))
    return bruto !== null ? (JSON.parse(bruto) as T) : undefined
  } catch {
    return undefined
  }
}

function salvarCache<T>(path: string, valor: T): void {
  try {
    localStorage.setItem(chaveCache(path), JSON.stringify(valor))
  } catch {
    // localStorage cheio ou indisponível — o cache é só um extra de resiliência, segue sem ele
  }
}

// sem isso, um fetch pra um servidor inalcançável (celular desligado, Tailscale fora do ar) fica
// pendurado por dezenas de segundos (ou mais) até o próprio SO desistir da conexão — trava telas
// inteiras (ex: "a máquina está pensando…" no xadrez) por tempo nenhum motivo. 6s é bastante tempo
// pra uma resposta normal do servidor, mas curto o suficiente pra sentir rápido quando ele está fora.
const TIMEOUT_REQUISICAO_MS = 6000

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_REQUISICAO_MS)
    try {
      res = await fetch(`${getServerUrl()}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    throw new ServidorInalcancavelError(
      `Não foi possível conectar ao servidor (${getServerUrl()}). Verifique se o celular está ligado, com o servidor rodando no Termux, e com o Tailscale conectado (tanto no celular quanto neste dispositivo).`,
    )
  }
  if (res.status === 404) {
    throw new Error('not-found')
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('O usuário não tem acesso ao servidor.')
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
  try {
    const dados = await request<T[]>(`/${storeName}`)
    salvarCache(storeName, dados)
    return dados
  } catch (err) {
    if (err instanceof ServidorInalcancavelError) {
      const emCache = lerCache<T[]>(storeName)
      if (emCache) return emCache
    }
    throw err
  }
}

export async function dbGet<T>(storeName: string, id: string): Promise<T | undefined> {
  const caminho = `${storeName}/${id}`
  try {
    const dado = await request<T>(`/${storeName}/${id}`)
    salvarCache(caminho, dado)
    return dado
  } catch (err) {
    if (err instanceof ServidorInalcancavelError) {
      const emCache = lerCache<T>(caminho)
      if (emCache !== undefined) return emCache
      throw err
    }
    if (err instanceof Error && err.message === 'not-found') return undefined
    throw err
  }
}

export async function dbDelete(storeName: string, id: string): Promise<void> {
  await request(`/${storeName}/${id}`, { method: 'DELETE' })
}
