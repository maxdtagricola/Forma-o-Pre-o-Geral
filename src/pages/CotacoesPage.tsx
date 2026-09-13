import { useEffect, useMemo, useState } from 'react'
import { listQuotes, updateQuoteStatus } from '../db/analysesRepo'
import { Badge, Button } from '../components/ui/Basics'
import { SelectField, TextField } from '../components/ui/Field'
import { PedidoCompraModal } from '../components/PedidoCompraModal'
import { formatCurrency, formatDate } from '../utils'
import { QUOTE_STATUSES, TIPOS_REFERENCIA, VENDEDORES } from '../types'
import type { PedidoCompraInfo, QuoteRecord, QuoteStatus, TipoReferencia } from '../types'

const vendedorOptions = [{ value: '', label: '— selecione —' }, ...VENDEDORES.map((v) => ({ value: v, label: v }))]
const tipoOptions = TIPOS_REFERENCIA.map((t) => ({ value: t.value, label: t.label }))

export function CotacoesPage({
  refreshKey,
  currentAdmin,
  onCreateQuote,
  onOpenQuote,
}: {
  refreshKey: number
  currentAdmin: string
  onCreateQuote: (vendedor: string, cliente: string, tipo: TipoReferencia) => Promise<void>
  onOpenQuote: (record: QuoteRecord) => void
}) {
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [vendedor, setVendedor] = useState('')
  const [cliente, setCliente] = useState('')
  const [tipo, setTipo] = useState<TipoReferencia>('itens')
  const [criando, setCriando] = useState(false)
  const [pedidoModalRecord, setPedidoModalRecord] = useState<QuoteRecord | undefined>(undefined)

  async function refresh() {
    setLoading(true)
    try {
      setRecords(await listQuotes())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar cotações do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  async function handleCriar() {
    if (!vendedor) {
      alert('Selecione o vendedor.')
      return
    }
    setCriando(true)
    try {
      await onCreateQuote(vendedor, cliente, tipo)
      setVendedor('')
      setCliente('')
      setTipo('itens')
    } finally {
      setCriando(false)
    }
  }

  async function handleStatusChange(record: QuoteRecord, novoStatus: QuoteStatus) {
    if (novoStatus === 'PEDIDO DE COMPRA') {
      setPedidoModalRecord(record)
      return
    }
    try {
      await updateQuoteStatus(record.id, novoStatus, currentAdmin)
      refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  async function handleConfirmPedidoCompra(info: PedidoCompraInfo) {
    if (!pedidoModalRecord) return
    try {
      await updateQuoteStatus(pedidoModalRecord.id, 'PEDIDO DE COMPRA', currentAdmin, info)
      setPedidoModalRecord(undefined)
      refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  const grupos = useMemo(() => {
    return QUOTE_STATUSES.map((status) => ({
      status,
      itens: records.filter((r) => r.status === status).sort((a, b) => b.createdAt - a.createdAt),
    })).filter((g) => g.itens.length > 0)
  }, [records])

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Nova cotação</h2>
        <p className="text-sm text-ink-400 mb-4">
          Identifique o vendedor, o cliente e a que se refere — depois é só ir pra Precificação e adicionar os itens.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <SelectField label="Vendedor" value={vendedor} onChange={setVendedor} options={vendedorOptions} />
          <TextField label="Cliente" value={cliente} onChange={setCliente} uppercase />
          <SelectField
            label="Refere-se a"
            value={tipo}
            onChange={(v) => setTipo(v as TipoReferencia)}
            options={tipoOptions}
          />
        </div>
        <Button variant="primary" onClick={handleCriar} disabled={criando}>
          Criar cotação e ir pra Precificação
        </Button>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Cotações por status</h2>

        {loading ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : grupos.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">Nenhuma cotação criada ainda.</p>
        ) : (
          <div className="space-y-6">
            {grupos.map((grupo) => (
              <div key={grupo.status}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone="neutral">{grupo.status}</Badge>
                  <span className="text-xs text-ink-400">{grupo.itens.length}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-ink-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-400 border-b border-ink-100">
                        <th className="py-2 px-3 font-medium">Nome</th>
                        <th className="py-2 px-3 font-medium">Data criada</th>
                        <th className="py-2 px-3 font-medium">Status</th>
                        <th className="py-2 px-3 font-medium">Em análise por</th>
                        <th className="py-2 px-3 font-medium text-right">Valor da cotação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.itens.map((r) => {
                        const travadaPorOutro = r.status !== 'PENDENTE' && !!r.responsavelStatus && r.responsavelStatus !== currentAdmin
                        return (
                          <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                            <td
                              onClick={() => onOpenQuote(r)}
                              className="cursor-pointer py-2 px-3 text-ink-800"
                            >
                              COTAÇÃO | {r.vendedor || '—'} | {r.cliente || '(sem cliente)'}
                            </td>
                            <td onClick={() => onOpenQuote(r)} className="cursor-pointer py-2 px-3 text-ink-500">
                              {formatDate(r.createdAt)}
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={r.status}
                                disabled={travadaPorOutro}
                                onChange={(e) => handleStatusChange(r, e.target.value as QuoteStatus)}
                                className={`field-input text-xs py-1.5 ${travadaPorOutro ? 'opacity-60 cursor-not-allowed' : ''}`}
                                title={travadaPorOutro ? `Em análise por ${r.responsavelStatus} — só ele(a) pode mudar` : undefined}
                              >
                                {QUOTE_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-ink-500">{r.responsavelStatus || '—'}</td>
                            <td
                              onClick={() => onOpenQuote(r)}
                              className="cursor-pointer py-2 px-3 text-right font-mono tabular-nums text-ink-800"
                            >
                              {r.summary.precoVendaTotalGeral > 0 ? formatCurrency(r.summary.precoVendaTotalGeral) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pedidoModalRecord && (
        <PedidoCompraModal
          quote={pedidoModalRecord}
          onConfirm={handleConfirmPedidoCompra}
          onCancel={() => setPedidoModalRecord(undefined)}
        />
      )}
    </div>
  )
}
