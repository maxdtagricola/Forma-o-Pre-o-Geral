import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { TextField, AutocompleteField, NumberField } from '../components/ui/Field'
import { Button } from '../components/ui/Basics'
import { DonutChart, limitarComOutros, type DonutDatum } from '../components/DonutChart'
import { StatTile } from '../components/StatTile'
import { deleteNotaFiscal, listNotasFiscais, saveNotaFiscal, updateNotaFiscalStatus } from '../db/notasFiscaisRepo'
import { listFornecedores } from '../db/fornecedoresRepo'
import { getStatusColors } from '../db/configRepo'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { formatCurrency, formatDate } from '../utils'
import { PERIODOS, inicioPeriodo, type Periodo } from '../periodo'
import { DEFAULT_NOTA_FISCAL, NOTA_FISCAL_STATUSES, RECEBEDORES, TRANSPORTADORAS } from '../types'
import type { Fornecedor, NotaFiscal, NotaFiscalStatus } from '../types'

const transportadoraSuggestions = TRANSPORTADORAS.map((t) => ({ value: t, label: t }))
const recebedorSuggestions = RECEBEDORES.map((r) => ({ value: r, label: r }))

export function AcompanhamentoNotasPage({ currentAdmin }: { currentAdmin: string }) {
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(DEFAULT_NOTA_FISCAL)
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [coresStatus, setCoresStatus] = useState<Record<string, string>>({})
  const [periodo, setPeriodo] = useState<Periodo>('mes')

  async function refresh() {
    setLoading(true)
    try {
      setNotas(await listNotasFiscais())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar notas fiscais do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    listFornecedores()
      .then(setFornecedores)
      .catch(() => {
        // sugestão é só um extra — se o servidor estiver fora, o campo continua livre normalmente
      })
    getStatusColors()
      .then(setCoresStatus)
      .catch(() => {
        // cores customizadas são só um extra visual — se o servidor falhar, usa a paleta padrão
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function corDoStatus(status: string): string {
    return coresStatus[status] || corPadraoDoStatus(status, NOTA_FISCAL_STATUSES)
  }

  async function handleStatusChange(nota: NotaFiscal, novoStatus: NotaFiscalStatus) {
    try {
      await updateNotaFiscalStatus(nota.id, novoStatus)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  function patch(p: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...p }))
  }

  function handleCancelEdit() {
    setForm(DEFAULT_NOTA_FISCAL)
    setEditingId(undefined)
  }

  async function handleSubmit() {
    if (!form.numeroNfe.trim()) {
      alert('Informe o número da NF-e.')
      return
    }
    setSaving(true)
    try {
      await saveNotaFiscal(form, currentAdmin, editingId)
      handleCancelEdit()
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar a nota fiscal no servidor.')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(n: NotaFiscal) {
    setForm({
      numeroNfe: n.numeroNfe,
      fornecedor: n.fornecedor,
      recebedor: n.recebedor,
      transportadora: n.transportadora,
      valorNota: n.valorNota,
      valorFrete: n.valorFrete,
    })
    setEditingId(n.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string, e?: MouseEvent) {
    e?.stopPropagation()
    if (!confirm('Excluir esta nota fiscal? Essa ação não pode ser desfeita.')) return
    try {
      await deleteNotaFiscal(id)
      if (editingId === id) handleCancelEdit()
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir a nota fiscal no servidor.')
    }
  }

  const fornecedorSuggestions = useMemo(() => fornecedores.map((f) => ({ value: f.id, label: f.nome })), [fornecedores])

  const notasDoPeriodo = useMemo(() => {
    const inicio = inicioPeriodo(periodo)
    return notas.filter((n) => n.createdAt >= inicio)
  }, [notas, periodo])

  const statusData: DonutDatum[] = useMemo(
    () =>
      NOTA_FISCAL_STATUSES.map((status) => ({
        label: status,
        value: notasDoPeriodo.filter((n) => n.status === status).length,
        color: corDoStatus(status),
      })).filter((d) => d.value > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notasDoPeriodo, coresStatus],
  )

  const valorTotalNotas = notasDoPeriodo.reduce((s, n) => s + n.valorNota, 0)
  const valorTotalFrete = notasDoPeriodo.reduce((s, n) => s + n.valorFrete, 0)

  // valores de transferência — soma do valor das notas por filial (recebedor) no período
  const valorPorRecebedorData: DonutDatum[] = useMemo(() => {
    const porRecebedor = new Map<string, number>()
    for (const n of notasDoPeriodo) {
      const chave = n.recebedor || '(sem recebedor)'
      porRecebedor.set(chave, (porRecebedor.get(chave) ?? 0) + n.valorNota)
    }
    return limitarComOutros(
      Array.from(porRecebedor.entries()).map(([label, value]) => ({ label, value })),
      7,
    )
  }, [notasDoPeriodo])

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notas
    return notas.filter(
      (n) =>
        n.numeroNfe.toLowerCase().includes(q) ||
        n.fornecedor.toLowerCase().includes(q) ||
        n.recebedor.toLowerCase().includes(q) ||
        n.transportadora.toLowerCase().includes(q),
    )
  }, [notas, query])

  // agrupa por status — dá pra ver de cara o que já foi concluído, o que tá em
  // processo e o que ainda falta, em vez de uma lista única misturada
  const grupos = useMemo(() => {
    return NOTA_FISCAL_STATUSES.map((status) => ({
      status,
      itens: filtradas.filter((n) => n.status === status).sort((a, b) => b.createdAt - a.createdAt),
    })).filter((g) => g.itens.length > 0)
  }, [filtradas])

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Dashboard</h2>
        <p className="text-sm text-ink-400 mb-4">Visão geral das notas fiscais no período selecionado.</p>
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriodo(p.value)}
              className={`pill-tab border ${
                periodo === p.value
                  ? 'bg-ink-950 border-ink-950 text-white'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile label="Notas no período" value={String(notasDoPeriodo.length)} />
            <StatTile label="Valor total das notas" value={formatCurrency(valorTotalNotas)} />
            <StatTile label="Valor total de frete" value={formatCurrency(valorTotalFrete)} />
          </div>

          <div className="card">
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Status das notas</h3>
            <p className="text-xs text-ink-400 mb-4">Quantidade de notas em cada status, no período selecionado.</p>
            <DonutChart
              data={statusData}
              centerValue={String(notasDoPeriodo.length)}
              centerLabel="Notas"
              valueFormatter={(v) => String(v)}
              emptyText="Nenhuma nota nesse período."
            />
          </div>

          <div className="card">
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Valores de transferência</h3>
            <p className="text-xs text-ink-400 mb-4">
              Soma do valor das notas por filial (recebedor), no período selecionado.
            </p>
            <DonutChart
              data={valorPorRecebedorData}
              centerValue={formatCurrency(valorTotalNotas)}
              centerLabel="Total"
              valueFormatter={formatCurrency}
              emptyText="Nenhuma nota com valor nesse período."
            />
          </div>
        </>
      )}

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Registro de Notas</h2>
        <p className="text-sm text-ink-400 mb-5">Acompanhamento de notas — por enquanto só visível pra você.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Número da NF-e" value={form.numeroNfe} onChange={(v) => patch({ numeroNfe: v })} />
          <AutocompleteField
            label="Fornecedor"
            value={form.fornecedor}
            onChange={(v) => patch({ fornecedor: v })}
            suggestions={fornecedorSuggestions}
            onSelectSuggestion={(s) => patch({ fornecedor: s.label })}
          />
          <AutocompleteField
            label="Recebedor"
            value={form.recebedor}
            onChange={(v) => patch({ recebedor: v })}
            suggestions={recebedorSuggestions}
          />
          <AutocompleteField
            label="Transportadora"
            value={form.transportadora}
            onChange={(v) => patch({ transportadora: v })}
            suggestions={transportadoraSuggestions}
          />
          <NumberField
            label="Valor da nota fiscal"
            value={form.valorNota}
            onChange={(v) => patch({ valorNota: v })}
            prefix="R$"
            step={0.01}
            min={0}
          />
          <NumberField
            label="Valor do frete"
            value={form.valorFrete}
            onChange={(v) => patch({ valorFrete: v })}
            prefix="R$"
            step={0.01}
            min={0}
          />
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {editingId ? 'Salvar alterações' : 'Adicionar Novo Registro'}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={handleCancelEdit}>
              Cancelar edição
            </Button>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Notas fiscais registradas</h2>
        <input
          type="text"
          className="field-input max-w-sm mb-4"
          placeholder="Buscar por NF-e, fornecedor, recebedor ou transportadora…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {loading ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">
            {notas.length === 0 ? 'Nenhuma nota fiscal registrada ainda.' : 'Nada encontrado.'}
          </p>
        ) : (
          <div className="space-y-6">
            {grupos.map((grupo) => (
              <div key={grupo.status}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: corDoStatus(grupo.status), color: corTexto(corDoStatus(grupo.status)) }}
                  >
                    {grupo.status}
                  </span>
                  <span className="text-xs text-ink-400">{grupo.itens.length}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-ink-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-400 border-b border-ink-100">
                        <th className="py-2 px-3 font-medium">NF-e</th>
                        <th className="py-2 px-3 font-medium">Fornecedor</th>
                        <th className="py-2 px-3 font-medium">Recebedor</th>
                        <th className="py-2 px-3 font-medium">Transportadora</th>
                        <th className="py-2 px-3 font-medium text-right">Valor nota</th>
                        <th className="py-2 px-3 font-medium text-right">Valor frete</th>
                        <th className="py-2 px-3 font-medium">Status</th>
                        <th className="py-2 px-3 font-medium">Registrada em</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.itens.map((n) => (
                        <tr
                          key={n.id}
                          onClick={() => handleEdit(n)}
                          className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50 group"
                        >
                          <td className="py-2 px-3 font-mono text-ink-800">{n.numeroNfe}</td>
                          <td className="py-2 px-3 text-ink-800">{n.fornecedor || '—'}</td>
                          <td className="py-2 px-3 text-ink-600">{n.recebedor || '—'}</td>
                          <td className="py-2 px-3 text-ink-600">{n.transportadora || '—'}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-800">
                            {formatCurrency(n.valorNota)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-600">
                            {formatCurrency(n.valorFrete)}
                          </td>
                          <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: corDoStatus(n.status) }}
                              />
                              <select
                                value={n.status}
                                onChange={(e) => handleStatusChange(n, e.target.value as NotaFiscalStatus)}
                                className="field-input text-xs py-1.5"
                              >
                                {NOTA_FISCAL_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-ink-400">{formatDate(n.createdAt)}</td>
                          <td className="py-2 px-3 text-center">
                            <span
                              onClick={(e) => handleDelete(n.id, e)}
                              className="hidden group-hover:inline text-xs font-medium text-rose-600 hover:text-rose-700"
                            >
                              Excluir
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {editingId && (
          <button
            type="button"
            onClick={() => handleDelete(editingId)}
            className="h-10 px-4 rounded-full bg-rose-600 text-white text-sm font-medium shadow-lg hover:bg-rose-700 transition"
          >
            Excluir
          </button>
        )}
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Voltar ao topo"
          title="Voltar ao topo"
          className="h-11 w-11 rounded-full bg-ink-950 text-white text-lg shadow-lg hover:bg-ink-800 transition flex items-center justify-center"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
