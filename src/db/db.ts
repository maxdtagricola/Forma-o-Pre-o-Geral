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
//
// Senhas: o servidor só responde com a SENHA DE ACESSO (pedida uma vez por
// aparelho e guardada no localStorage). Algumas gravações (empresas,
// planilhas de markup, excluir produto/partidas...) pedem também a SENHA DE
// ADMIN, digitada na hora e conferida pelo próprio servidor. As duas são
// definidas no celular do servidor (node definir-senhas.js).
// -----------------------------------------------------------------------
import { getCurrentAdmin } from '../currentAdmin'
import { getCurrentPlayer } from '../currentPlayer'
import { pedirSenha } from '../dialogs'

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

const CHAVE_SENHA_ACESSO = 'senhaAcessoServidor'

function lerSenhaAcesso(): string {
  try {
    return localStorage.getItem(CHAVE_SENHA_ACESSO) ?? ''
  } catch {
    return ''
  }
}

// sem isso, um fetch pra um servidor inalcançável (celular desligado, Tailscale fora do ar) fica
// pendurado por dezenas de segundos (ou mais) até o próprio SO desistir da conexão — trava telas
// inteiras (ex: "a máquina está pensando…" no xadrez) por tempo nenhum motivo. 6s é bastante tempo
// pra uma resposta normal do servidor, mas curto o suficiente pra sentir rápido quando ele está fora.
const TIMEOUT_REQUISICAO_MS = 6000

interface OpcoesRequisicao {
  method?: string
  body?: string
  /** Senha de admin digitada agora — só nas operações que o servidor protege. */
  senhaAdmin?: string
}

async function enviar(path: string, opcoes: OpcoesRequisicao, senhaAcesso: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // URI-encoded: cabeçalho HTTP não aceita acento (nomes como "Gouvêa", senhas com "ç")
  if (senhaAcesso) headers['X-Senha-Acesso'] = encodeURIComponent(senhaAcesso)
  if (opcoes.senhaAdmin) headers['X-Senha-Admin'] = encodeURIComponent(opcoes.senhaAdmin)
  const usuario = getCurrentAdmin() ?? getCurrentPlayer()
  if (usuario) headers['X-Usuario'] = encodeURIComponent(usuario)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_REQUISICAO_MS)
    try {
      return await fetch(`${getServerUrl()}${path}`, {
        method: opcoes.method,
        body: opcoes.body,
        headers,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    // sem o endereço do servidor nem detalhes de infraestrutura no texto — essa mensagem aparece na
    // tela de qualquer admin (e em prints/compartilhamento de tela); quem precisa do endereço pra
    // diagnosticar acha ele em DEFAULT_SERVER_URL / localStorage 'serverUrl'
    throw new ServidorInalcancavelError(
      'Não foi possível conectar ao servidor. Verifique se o celular do servidor está ligado, com o servidor rodando, e se o Tailscale está conectado (tanto no celular quanto neste aparelho).',
    )
  }
}

const MENSAGEM_SEM_ACESSO =
  'Sem a senha de acesso, o app não consegue ler nem salvar dados no servidor. Recarregue a página para digitá-la.'

async function tratarResposta<T>(res: Response): Promise<T> {
  if (res.status === 404) {
    throw new Error('not-found')
  }
  if (res.status === 401) {
    throw new Error(MENSAGEM_SEM_ACESSO)
  }
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    const corpo = (await res.json().catch(() => ({}))) as { erro?: string; minutos?: number }
    if (corpo.erro === 'senha-admin') throw new Error('Senha incorreta.')
    if (corpo.erro === 'bloqueado') {
      throw new Error(
        `Muitas senhas erradas a partir deste aparelho. Por segurança, ele foi bloqueado no servidor — tente de novo em ${corpo.minutos ?? 15} min.`,
      )
    }
    if (corpo.erro === 'sem-senhas') {
      throw new Error('O servidor ainda não tem senhas definidas. No celular do servidor, rode: node definir-senhas.js')
    }
    throw new Error('O usuário não tem acesso ao servidor.')
  }
  if (!res.ok) {
    throw new Error(`Erro do servidor (${res.status}): ${await res.text()}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// uma pergunta só pela senha de acesso, mesmo com várias requisições recusadas ao mesmo tempo (ao
// abrir o app saem várias juntas) — todas esperam a mesma resposta
let perguntaSenhaAcesso: Promise<boolean> | null = null
// quem cancelou a pergunta não é perguntado de novo a cada requisição — só ao recarregar a página
let recusouSenhaAcesso = false

async function perguntarSenhaAcesso(): Promise<boolean> {
  let mensagem =
    'Digite a senha de acesso ao servidor. Ela fica guardada neste aparelho e só é pedida de novo se for trocada.'
  for (;;) {
    const senha = await pedirSenha(mensagem, { titulo: 'Senha de acesso', confirmText: 'Entrar' })
    if (senha === null) {
      recusouSenhaAcesso = true
      return false
    }
    const res = await enviar('/_acesso', {}, senha)
    if (res.ok) {
      try {
        localStorage.setItem(CHAVE_SENHA_ACESSO, senha)
      } catch {
        // sem localStorage a senha vale só até recarregar — melhor que não entrar
      }
      return true
    }
    if (res.status !== 401) await tratarResposta(res) // bloqueado, servidor sem senhas...
    mensagem = 'Senha incorreta. Digite a senha de acesso ao servidor.'
  }
}

function obterSenhaAcesso(): Promise<boolean> {
  if (recusouSenhaAcesso) return Promise.resolve(false)
  if (!perguntaSenhaAcesso) {
    perguntaSenhaAcesso = perguntarSenhaAcesso().finally(() => {
      perguntaSenhaAcesso = null
    })
  }
  return perguntaSenhaAcesso
}

async function request<T>(path: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const senhaUsada = lerSenhaAcesso()
    const res = await enviar(path, opcoes, senhaUsada)
    if (res.status === 401 && tentativa < 3) {
      // a senha guardada mudou enquanto esta esperava (outra requisição já perguntou)? só repete
      if (lerSenhaAcesso() !== senhaUsada) continue
      if (await obterSenhaAcesso()) continue
    }
    return tratarResposta<T>(res)
  }
}

/** Confere a senha de admin no servidor antes de uma ação que pede senha. Lança 'Senha incorreta.' se não bater. */
export async function verificarSenhaAdmin(senha: string): Promise<void> {
  if (!senha) throw new Error('Senha incorreta.')
  await request('/_admin', { method: 'POST', senhaAdmin: senha })
}

export async function dbPut<T extends { id: string }>(
  storeName: string,
  value: T,
  opcoes?: { senhaAdmin?: string },
): Promise<void> {
  await request(`/${storeName}/${value.id}`, {
    method: 'PUT',
    body: JSON.stringify(value),
    senhaAdmin: opcoes?.senhaAdmin,
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

export async function dbDelete(storeName: string, id: string, opcoes?: { senhaAdmin?: string }): Promise<void> {
  await request(`/${storeName}/${id}`, { method: 'DELETE', senhaAdmin: opcoes?.senhaAdmin })
}
