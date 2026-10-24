import { useEffect, useState } from 'react'
import { dbGet, dbPut } from './db/db'
import type { UsuarioLogado } from './sessaoUsuario'

// O que cada usuário vê na Tela Inicial — o MÁXIMUS (gestor) escolhe em Configurações › Usuários (ou
// num tipo de usuário). Fica em configuracoes/telaInicialPorUsuario; quem não tem escolha guardada vê
// tudo. O gestor vê sempre tudo.

const STORE_CONFIG = 'configuracoes'
const DOC = 'telaInicialPorUsuario'
// a última lista vista, pra montar a tela na hora enquanto o servidor responde
const PREFIXO_CACHE = 'telaInicial:partes:'

export type ParteTelaInicial =
  | 'atalhos'
  | 'avisoProducao'
  | 'numeros'
  | 'pendentes'
  | 'emAndamento'
  | 'emProducao'
  | 'emTransporte'
  | 'atividade'
  | 'transferencias'
  | 'retorno'

/** As partes da Tela Inicial, na ordem em que aparecem. */
export const PARTES_TELA_INICIAL: { key: ParteTelaInicial; label: string; dica?: string }[] = [
  { key: 'atalhos', label: 'Atalhos (Nova cotação, Importar, Continuar)' },
  { key: 'avisoProducao', label: 'Aviso de produção ficando pronta' },
  { key: 'numeros', label: 'Números do dia (novas, enviadas, confirmados)' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'emAndamento', label: 'Em andamento (as cotações com a pessoa)' },
  { key: 'emProducao', label: 'Em produção' },
  { key: 'emTransporte', label: 'Em transporte' },
  { key: 'atividade', label: 'Atividade recente da equipe' },
  { key: 'transferencias', label: 'Transferências fiscais', dica: 'só aparece pra quem também tem a aba Transferências Fiscais' },
  { key: 'retorno', label: 'Retorno do cliente', dica: 'também o aviso ao entrar no site' },
]

export const TODAS_AS_PARTES: ParteTelaInicial[] = PARTES_TELA_INICIAL.map((p) => p.key)

interface TelaInicialDoc {
  id: string
  porUsuario: Record<string, ParteTelaInicial[]>
}

export async function getTelaInicialPorUsuario(): Promise<Record<string, ParteTelaInicial[]>> {
  const doc = await dbGet<TelaInicialDoc>(STORE_CONFIG, DOC)
  return doc?.porUsuario ?? {}
}

/** `partes` null = vê tudo (inclusive o que entrar na Tela Inicial depois). Só o Max (o servidor recusa os outros). */
export async function salvarTelaInicialDoUsuario(login: string, partes: ParteTelaInicial[] | null): Promise<void> {
  const porUsuario = { ...(await getTelaInicialPorUsuario()) }
  if (partes === null) delete porUsuario[login]
  else porUsuario[login] = partes
  await dbPut(STORE_CONFIG, { id: DOC, porUsuario })
}

function lerCache(login: string): ParteTelaInicial[] | null {
  try {
    const bruto = localStorage.getItem(PREFIXO_CACHE + login)
    return bruto ? (JSON.parse(bruto) as ParteTelaInicial[]) : null
  } catch {
    return null
  }
}

function gravarCache(login: string, partes: ParteTelaInicial[]) {
  try {
    localStorage.setItem(PREFIXO_CACHE + login, JSON.stringify(partes))
  } catch {
    // sem localStorage: na próxima abertura a tela espera o servidor
  }
}

/** As partes da Tela Inicial do usuário logado. null = ainda não se sabe (primeira vez neste aparelho,
 * esperando o servidor) — a tela fica em "Carregando…" em vez de mostrar o que não devia. */
export function useMinhaTelaInicial(usuario: UsuarioLogado): ParteTelaInicial[] | null {
  const [partes, setPartes] = useState<ParteTelaInicial[] | null>(() => (usuario.gestor ? TODAS_AS_PARTES : lerCache(usuario.login)))

  useEffect(() => {
    if (usuario.gestor) return
    let cancelado = false
    getTelaInicialPorUsuario()
      .then((porUsuario) => {
        if (cancelado) return
        const lista = porUsuario[usuario.login] ?? TODAS_AS_PARTES
        setPartes(lista)
        gravarCache(usuario.login, lista)
      })
      .catch(() => {
        // sem servidor agora: fica a última lista vista (ou tudo, se nunca viu)
        if (!cancelado) setPartes((atual) => atual ?? TODAS_AS_PARTES)
      })
    return () => {
      cancelado = true
    }
  }, [usuario.login, usuario.gestor])

  return partes
}
