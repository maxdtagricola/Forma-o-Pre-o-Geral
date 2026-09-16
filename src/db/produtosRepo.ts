import { dbDelete, dbGet, dbGetAll, dbPut } from './db'
import { makeId } from '../utils'
import type { PreRegistroItem, Produto, QuoteRecord } from '../types'

const STORE_PRODUTOS = 'produtos'

export async function listProdutos(): Promise<Produto[]> {
  const all = await dbGetAll<Produto>(STORE_PRODUTOS)
  return all.sort((a, b) => (a.descricao || a.referencias[0] || '').localeCompare(b.descricao || b.referencias[0] || '', 'pt-BR'))
}

export async function updateProduto(
  id: string,
  patch: Partial<Pick<Produto, 'interno' | 'descricao' | 'referencias' | 'ncm' | 'peso'>>,
): Promise<Produto> {
  const atual = await dbGet<Produto>(STORE_PRODUTOS, id)
  if (!atual) throw new Error('Produto não encontrado.')
  const atualizado: Produto = { ...atual, ...patch, updatedAt: Date.now() }
  await dbPut(STORE_PRODUTOS, atualizado)
  return atualizado
}

export async function deleteProduto(id: string): Promise<void> {
  await dbDelete(STORE_PRODUTOS, id)
}

/**
 * Chamado ao clicar "Salvar" em Itens a cotar. Registra cada item no catálogo de produtos (casado
 * por Interno, ou por Referência quando ainda não há Interno) — mas só grava de fato se ainda não
 * existir registro dele lá, ou se o Interno definido agora for diferente do que já está salvo.
 * Sem essa checagem, clicar "Salvar" de novo sem mudar nada ficaria reescrevendo o mesmo produto
 * a cada vez.
 */
export async function registrarItensPreRegistro(itens: PreRegistroItem[]): Promise<void> {
  const relevantes = itens.filter((it) => it.interno.trim() || it.referencia.trim())
  if (relevantes.length === 0) return

  const existentes = await dbGetAll<Produto>(STORE_PRODUTOS)
  const porInterno = new Map(existentes.filter((p) => p.interno.trim()).map((p) => [p.interno.trim(), p] as const))
  const porReferencia = new Map<string, Produto>()
  for (const p of existentes) for (const r of p.referencias) porReferencia.set(r.trim().toLowerCase(), p)

  const agora = Date.now()
  const escritas: Promise<void>[] = []

  for (const item of relevantes) {
    const interno = item.interno.trim()
    const referencia = item.referencia.trim()
    const referenciaNorm = referencia.toLowerCase()
    // tenta casar pelo Interno primeiro; se o Interno definido agora não bate com nenhum produto
    // ainda (ex.: acabou de mudar), cai pra Referência — senão um Interno novo pra uma peça que já
    // tem registro criaria um produto duplicado em vez de atualizar o Interno do existente
    let existente = interno ? porInterno.get(interno) : undefined
    if (!existente && referenciaNorm) existente = porReferencia.get(referenciaNorm)

    if (existente && existente.interno.trim() === interno) {
      continue // já registrado com o mesmo Interno (ou os dois sem Interno) — não regrava
    }

    if (existente) {
      // já existe registro pra essa Referência, mas com um Interno diferente do definido agora —
      // atualiza o Interno dele em vez de criar um produto separado pra mesma peça
      const atualizado: Produto = { ...existente, interno, updatedAt: agora }
      escritas.push(dbPut(STORE_PRODUTOS, atualizado))
      if (interno) porInterno.set(interno, atualizado)
    } else {
      const novo: Produto = {
        id: makeId(),
        interno,
        descricao: item.descricao ?? '',
        referencias: referencia ? [referencia] : [],
        ncm: '',
        peso: 0,
        createdAt: agora,
        updatedAt: agora,
      }
      escritas.push(dbPut(STORE_PRODUTOS, novo))
      if (interno) porInterno.set(interno, novo)
      if (referenciaNorm) porReferencia.set(referenciaNorm, novo)
    }
  }

  await Promise.all(escritas)
}

/**
 * Sincroniza o catálogo independente de produtos a partir das cotações atuais: qualquer item (já
 * precificado ou ainda só no pré-registro) mais novo do que o que já está salvo vira um produto
 * novo ou atualiza um existente (casado por Interno, ou por uma das Referências já conhecidas).
 * Isso é o que permite ao catálogo sobreviver caso a cotação de origem seja excluída depois — uma
 * vez sincronizado, o produto não depende mais dela pra continuar existindo.
 */
export async function sincronizarProdutos(quotes: QuoteRecord[]): Promise<Produto[]> {
  const existentes = await dbGetAll<Produto>(STORE_PRODUTOS)
  const porInterno = new Map<string, Produto>()
  const porReferencia = new Map<string, Produto>()
  for (const p of existentes) {
    if (p.interno.trim()) porInterno.set(p.interno.trim(), p)
    for (const r of p.referencias) porReferencia.set(r.trim().toLowerCase(), p)
  }

  const paraSalvar = new Map<string, Produto>()

  function considerar(dados: {
    interno: string
    descricao: string
    referencia: string
    ncm: string
    peso: number
    vistoEm: number
  }) {
    const interno = dados.interno.trim()
    const referencia = dados.referencia.trim()
    const referenciaNorm = referencia.toLowerCase()
    if (!interno && !referencia) return

    let atual = interno ? porInterno.get(interno) : undefined
    if (!atual && referenciaNorm) atual = porReferencia.get(referenciaNorm)
    if (atual && paraSalvar.has(atual.id)) atual = paraSalvar.get(atual.id)

    if (atual) {
      if (dados.vistoEm <= atual.updatedAt) return
      const jaTemReferencia = referenciaNorm && atual.referencias.some((r) => r.trim().toLowerCase() === referenciaNorm)
      const referencias = referencia && !jaTemReferencia ? [...atual.referencias, referencia] : atual.referencias
      const atualizado: Produto = {
        ...atual,
        interno: atual.interno || interno,
        descricao: dados.descricao || atual.descricao,
        referencias,
        ncm: dados.ncm || atual.ncm,
        peso: dados.peso || atual.peso,
        updatedAt: dados.vistoEm,
      }
      paraSalvar.set(atualizado.id, atualizado)
      if (atualizado.interno) porInterno.set(atualizado.interno, atualizado)
      for (const r of referencias) porReferencia.set(r.trim().toLowerCase(), atualizado)
    } else {
      const novo: Produto = {
        id: makeId(),
        interno,
        descricao: dados.descricao,
        referencias: referencia ? [referencia] : [],
        ncm: dados.ncm,
        peso: dados.peso,
        createdAt: dados.vistoEm,
        updatedAt: dados.vistoEm,
      }
      paraSalvar.set(novo.id, novo)
      if (interno) porInterno.set(interno, novo)
      for (const r of novo.referencias) porReferencia.set(r.trim().toLowerCase(), novo)
    }
  }

  for (const quote of quotes) {
    const referenciasJaPrecificadas = new Set(
      quote.items.map((it) => it.product.referencia.trim().toLowerCase()).filter(Boolean),
    )
    for (const item of quote.items) {
      const p = item.product
      considerar({
        interno: p.interno,
        descricao: p.descricao,
        referencia: p.referencia,
        ncm: p.ncm,
        peso: p.peso,
        vistoEm: quote.updatedAt,
      })
    }
    for (const pre of quote.itensPreRegistro) {
      const refNorm = pre.referencia.trim().toLowerCase()
      if (refNorm && referenciasJaPrecificadas.has(refNorm)) continue // já virou item precificado nessa cotação
      considerar({
        interno: pre.interno,
        descricao: pre.descricao ?? '',
        referencia: pre.referencia,
        ncm: '',
        peso: 0,
        vistoEm: quote.updatedAt,
      })
    }
  }

  if (paraSalvar.size > 0) {
    await Promise.all(Array.from(paraSalvar.values()).map((p) => dbPut(STORE_PRODUTOS, p)))
  }

  const resultadoPorId = new Map<string, Produto>()
  for (const p of existentes) resultadoPorId.set(p.id, p)
  for (const p of paraSalvar.values()) resultadoPorId.set(p.id, p)
  return Array.from(resultadoPorId.values()).sort((a, b) =>
    (a.descricao || a.referencias[0] || '').localeCompare(b.descricao || b.referencias[0] || '', 'pt-BR'),
  )
}
