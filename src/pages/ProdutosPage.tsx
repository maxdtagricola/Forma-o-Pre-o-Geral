import { useEffect, useMemo, useState } from 'react'
import { listQuotes, saveQuote, updateItensPreRegistro } from '../db/analysesRepo'
import { Button } from '../components/ui/Basics'
import { formatNumber } from '../utils'
import type { QuoteRecord } from '../types'

interface ProdutoResumo {
  key: string
  interno: string
  descricao: string
  referencia: string
  ncm: string
  peso: number
  updatedAt: number
}

function extrairProdutos(quotes: QuoteRecord[]): ProdutoResumo[] {
  const porChave = new Map<string, ProdutoResumo>()

  function considerar(candidato: ProdutoResumo) {
    const atual = porChave.get(candidato.key)
    if (!atual || candidato.updatedAt > atual.updatedAt) {
      porChave.set(candidato.key, candidato)
    }
  }

  for (const quote of quotes) {
    const referenciasJaPrecificadas = new Set(
      quote.items.map((it) => it.product.referencia.trim().toLowerCase()).filter(Boolean),
    )

    for (const item of quote.items) {
      const p = item.product
      const chave = p.interno.trim() || `${p.referencia.trim()}|${p.ncm.trim()}` || item.id
      considerar({
        key: chave,
        interno: p.interno,
        descricao: p.descricao,
        referencia: p.referencia,
        ncm: p.ncm,
        peso: p.peso,
        updatedAt: quote.updatedAt,
      })
    }

    for (const pre of quote.itensPreRegistro) {
      const refNorm = pre.referencia.trim().toLowerCase()
      if (refNorm && referenciasJaPrecificadas.has(refNorm)) continue // já virou item precificado nessa cotação
      const chave = pre.interno.trim() || `${pre.referencia.trim()}|` || pre.id
      considerar({
        key: chave,
        interno: pre.interno,
        descricao: pre.descricao ?? '',
        referencia: pre.referencia,
        ncm: '',
        peso: 0,
        updatedAt: quote.updatedAt,
      })
    }
  }
  return Array.from(porChave.values()).sort((a, b) =>
    (a.descricao || a.referencia).localeCompare(b.descricao || b.referencia, 'pt-BR'),
  )
}

export function ProdutosPage({ currentAdmin }: { currentAdmin: string }) {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | undefined>(undefined)

  async function refresh() {
    setLoading(true)
    try {
      setQuotes(await listQuotes())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar produtos do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const produtos = useMemo(() => extrairProdutos(quotes), [quotes])
  const semInterno = useMemo(() => produtos.filter((p) => !p.interno.trim()), [produtos])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return produtos
    return produtos.filter(
      (p) =>
        p.interno.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q) ||
        p.referencia.toLowerCase().includes(q) ||
        p.ncm.toLowerCase().includes(q),
    )
  }, [produtos, query])

  async function handleAdicionarInterno(produto: ProdutoResumo) {
    const valor = (rascunhos[produto.key] ?? '').trim()
    if (!valor) {
      alert('Informe o código Interno.')
      return
    }
    const alvo = produto.referencia.trim().toLowerCase()
    if (!alvo) {
      alert('Esse item não tem Referência pra localizar em qual(is) cotação(ões) ele aparece.')
      return
    }
    setSalvando(produto.key)
    let atualizadas = 0
    let bloqueadas = 0
    try {
      for (const quote of quotes) {
        let mudouItems = false
        const novosItems = quote.items.map((item) => {
          if (!item.product.interno.trim() && item.product.referencia.trim().toLowerCase() === alvo) {
            mudouItems = true
            return { ...item, product: { ...item.product, interno: valor } }
          }
          return item
        })
        let mudouPre = false
        const novosPreRegistro = quote.itensPreRegistro.map((it) => {
          if (!it.interno.trim() && it.referencia.trim().toLowerCase() === alvo) {
            mudouPre = true
            return { ...it, interno: valor }
          }
          return it
        })
        if (!mudouItems && !mudouPre) continue

        try {
          if (mudouItems) {
            await saveQuote(currentAdmin, quote.vendedor, quote.tipoReferencia, quote.cliente, quote.maquina, novosItems, quote.id)
          }
          if (mudouPre) {
            await updateItensPreRegistro(quote.id, novosPreRegistro, currentAdmin)
          }
          atualizadas++
        } catch {
          bloqueadas++
        }
      }
      setRascunhos((prev) => {
        const next = { ...prev }
        delete next[produto.key]
        return next
      })
      await refresh()
      alert(
        `Interno adicionado em ${atualizadas} cotação(ões).` +
          (bloqueadas > 0 ? ` ${bloqueadas} não puderam ser alteradas (em análise por outro admin).` : ''),
      )
    } finally {
      setSalvando(undefined)
    }
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Produtos</h2>
        <p className="text-sm text-ink-400 mb-4">
          Produtos já registrados em alguma cotação (precificados ou só na lista de itens a cotar) — um por código
          Interno (ou por referência + NCM quando não há Interno).
        </p>
        <input
          type="text"
          className="field-input max-w-sm"
          placeholder="Buscar por interno, descrição, referência ou NCM…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!loading && semInterno.length > 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            {semInterno.length} produto(s) sem código Interno. Quer completar agora? Preencha o campo na linha
            correspondente, na tabela abaixo.
          </p>
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">
            {produtos.length === 0 ? 'Nenhum produto salvo ainda.' : 'Nada encontrado.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-400 border-b border-ink-100">
                <th className="py-2 pr-4 font-medium min-w-[12rem]">Interno</th>
                <th className="py-2 pr-4 font-medium">Descrição</th>
                <th className="py-2 pr-4 font-medium">Referência</th>
                <th className="py-2 pr-4 font-medium">NCM</th>
                <th className="py-2 font-medium text-right">Peso (kg)</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.key} className="border-b border-ink-50 last:border-0">
                  <td className="py-2 pr-4 font-mono text-ink-800">
                    {p.interno ? (
                      p.interno
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          className="field-input py-1 text-xs font-mono"
                          placeholder="adicionar interno"
                          value={rascunhos[p.key] ?? ''}
                          onChange={(e) => setRascunhos((prev) => ({ ...prev, [p.key]: e.target.value }))}
                        />
                        <Button
                          variant="secondary"
                          className="shrink-0 py-1 px-2 text-xs"
                          onClick={() => handleAdicionarInterno(p)}
                          disabled={salvando === p.key}
                        >
                          Salvar
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-ink-800">{p.descricao || '—'}</td>
                  <td className="py-2 pr-4 text-ink-600">{p.referencia || '—'}</td>
                  <td className="py-2 pr-4 font-mono text-ink-600">{p.ncm || '—'}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink-600">
                    {p.peso ? formatNumber(p.peso, 2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
