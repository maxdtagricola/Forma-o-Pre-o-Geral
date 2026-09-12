import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { deleteQuote, listQuotes } from '../db/analysesRepo'
import { Badge } from '../components/ui/Basics'
import { formatCurrency, formatDate } from '../utils'
import type { QuoteRecord } from '../types'

export function HistoryPage({
  refreshKey,
  onLoad,
}: {
  refreshKey: number
  onLoad: (record: QuoteRecord) => void
}) {
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const all = await listQuotes()
      setRecords(all)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar o histórico do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter(
      (r) =>
        r.cliente.toLowerCase().includes(q) ||
        r.maquina.toLowerCase().includes(q) ||
        r.items.some((item) => {
          const p = item.product
          return (
            p.referencia.toLowerCase().includes(q) ||
            p.descricao.toLowerCase().includes(q) ||
            p.fornecedor.toLowerCase().includes(q) ||
            p.marca.toLowerCase().includes(q) ||
            p.ncm.toLowerCase().includes(q)
          )
        }),
    )
  }, [records, query])

  async function handleDelete(id: string, e: MouseEvent) {
    e.stopPropagation()
    if (!confirm('Excluir esta cotação salva? Essa ação não pode ser desfeita.')) return
    await deleteQuote(id)
    refresh()
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Histórico</h2>
        <p className="text-sm text-ink-400 mb-4">Cotações salvas no servidor do celular. Clique em uma para reabrir e editar.</p>
        <input
          type="text"
          className="field-input max-w-sm"
          placeholder="Buscar por cliente, máquina, referência, descrição, fornecedor, marca ou NCM…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card text-center text-sm text-ink-400 py-10">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <h3 className="font-display font-semibold text-ink-800 mb-1">
            {records.length === 0 ? 'Nenhuma cotação salva ainda' : 'Nada encontrado'}
          </h3>
          <p className="text-sm text-ink-400">
            {records.length === 0
              ? 'Salve uma cotação na aba Início para vê-la aqui.'
              : 'Tente outro termo de busca.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const first = r.items[0]
            const extras = r.items.length - 1
            return (
              <button
                key={r.id}
                onClick={() => onLoad(r)}
                className="card text-left hover:border-brand-300 hover:shadow-sm transition group relative"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900 truncate">
                      {r.cliente || first.product.descricao || '(sem descrição)'}
                    </p>
                    {r.maquina && <p className="text-xs text-ink-500 truncate">Máquina: {r.maquina}</p>}
                    <p className="text-xs text-ink-400 truncate">
                      Ref. {first.product.referencia || '—'} · NCM {first.product.ncm || '—'}
                    </p>
                  </div>
                  <Badge tone="neutral">
                    {r.summary.totalItens} {r.summary.totalItens === 1 ? 'item' : 'itens'}
                  </Badge>
                </div>

                <div className="text-xs text-ink-400 mb-3 space-y-0.5">
                  <p>Fornecedor: {first.product.fornecedor || '—'}</p>
                  {extras > 0 && <p>+ {extras} outro{extras > 1 ? 's' : ''} item{extras > 1 ? 's' : ''} nesta cotação</p>}
                </div>

                <div className="flex items-center justify-between border-t border-ink-100 pt-3">
                  <div>
                    <p className="text-[11px] text-ink-400">Total da cotação</p>
                    <p className="font-mono font-semibold text-ink-900 tabular-nums">
                      {formatCurrency(r.summary.precoVendaTotalGeral)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-ink-400 group-hover:hidden">{formatDate(r.updatedAt)}</span>
                    <span
                      onClick={(e) => handleDelete(r.id, e)}
                      className="hidden group-hover:inline text-[11px] font-medium text-rose-600 hover:text-rose-700"
                    >
                      Excluir cotação
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
