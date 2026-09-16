import { dbDelete, dbGet, dbGetAll, dbPut } from './db'
import { makeId } from '../utils'
import type { Produto, QuoteRecord } from '../types'

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
