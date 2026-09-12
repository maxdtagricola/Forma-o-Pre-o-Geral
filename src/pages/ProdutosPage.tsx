import { useEffect, useMemo, useState } from 'react'
import { listQuotes } from '../db/analysesRepo'
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
  for (const quote of quotes) {
    for (const item of quote.items) {
      const p = item.product
      const chave = p.interno.trim() || `${p.referencia.trim()}|${p.ncm.trim()}` || item.id
      const atual = porChave.get(chave)
      if (!atual || quote.updatedAt > atual.updatedAt) {
        porChave.set(chave, {
          key: chave,
          interno: p.interno,
          descricao: p.descricao,
          referencia: p.referencia,
          ncm: p.ncm,
          peso: p.peso,
          updatedAt: quote.updatedAt,
        })
      }
    }
  }
  return Array.from(porChave.values()).sort((a, b) =>
    (a.descricao || a.referencia).localeCompare(b.descricao || b.referencia, 'pt-BR'),
  )
}

export function ProdutosPage() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    listQuotes()
      .then(setQuotes)
      .catch((err) => alert(err instanceof Error ? err.message : 'Erro ao carregar produtos do servidor.'))
      .finally(() => setLoading(false))
  }, [])

  const produtos = useMemo(() => extrairProdutos(quotes), [quotes])

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

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Produtos</h2>
        <p className="text-sm text-ink-400 mb-4">
          Produtos já salvos em alguma cotação — um por código Interno (ou por referência + NCM quando não há
          Interno).
        </p>
        <input
          type="text"
          className="field-input max-w-sm"
          placeholder="Buscar por interno, descrição, referência ou NCM…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

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
                <th className="py-2 pr-4 font-medium">Interno</th>
                <th className="py-2 pr-4 font-medium">Descrição</th>
                <th className="py-2 pr-4 font-medium">Referência</th>
                <th className="py-2 pr-4 font-medium">NCM</th>
                <th className="py-2 font-medium text-right">Peso (kg)</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.key} className="border-b border-ink-50 last:border-0">
                  <td className="py-2 pr-4 font-mono text-ink-800">{p.interno || '—'}</td>
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
