import { useEffect, useMemo, useState } from 'react'
import { listQuotes } from '../db/analysesRepo'
import { getStatusColors } from '../db/configRepo'
import { formatCurrency } from '../utils'
import { COR_OUTROS, PALETA_CATEGORICA, corPadraoDoStatus } from '../statusColors'
import { DonutChart, limitarComOutros, type DonutDatum } from '../components/DonutChart'
import { StatTile } from '../components/StatTile'
import { PERIODOS, inicioPeriodo, type Periodo } from '../periodo'
import { QUOTE_STATUSES } from '../types'
import type { QuoteRecord } from '../types'

export function AnalyticsPage() {
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [coresStatus, setCoresStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    listQuotes()
      .then(setRecords)
      .catch((err) => alert(err instanceof Error ? err.message : 'Erro ao carregar cotações do servidor.'))
      .finally(() => setLoading(false))
    getStatusColors()
      .then(setCoresStatus)
      .catch(() => {
        // cores customizadas são só um extra visual — se o servidor falhar, usa a paleta padrão
      })
  }, [])

  const filtrados = useMemo(() => {
    const inicio = inicioPeriodo(periodo)
    return records.filter((r) => r.createdAt >= inicio)
  }, [records, periodo])

  const statusData: DonutDatum[] = useMemo(() => {
    const contagens = QUOTE_STATUSES.map((status) => ({
      label: status,
      value: filtrados.filter((r) => r.status === status).length,
      color: coresStatus[status] || corPadraoDoStatus(status),
    }))
    // se mais de 8 status estiverem ativos ao mesmo tempo, dobra o excedente em "Outros"
    const comValor = contagens.filter((d) => d.value > 0)
    if (comValor.length <= PALETA_CATEGORICA.length) return comValor
    const principais = comValor.slice(0, PALETA_CATEGORICA.length - 1)
    const resto = comValor.slice(PALETA_CATEGORICA.length - 1)
    return [
      ...principais,
      { label: `Outros (${resto.length} status)`, value: resto.reduce((s, d) => s + d.value, 0), color: COR_OUTROS },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, coresStatus])

  const valoresData: DonutDatum[] = useMemo(
    () =>
      limitarComOutros(
        filtrados.map((r) => ({
          label: r.cliente || '(sem cliente)',
          value: r.summary.precoVendaTotalGeral,
          title: `${r.vendedor || '—'} | ${r.cliente || '(sem cliente)'}`,
        })),
        7,
      ),
    [filtrados],
  )

  const fechadas = useMemo(() => filtrados.filter((r) => r.status === 'FATURADO'), [filtrados])
  const fechadasData: DonutDatum[] = useMemo(
    () =>
      limitarComOutros(
        fechadas.map((r) => ({
          label: r.cliente || '(sem cliente)',
          value: r.summary.precoVendaTotalGeral,
          title: `${r.vendedor || '—'} | ${r.cliente || '(sem cliente)'}`,
        })),
        7,
      ),
    [fechadas],
  )

  const valorTotalGeral = filtrados.reduce((s, r) => s + r.summary.precoVendaTotalGeral, 0)
  const valorFechado = fechadas.reduce((s, r) => s + r.summary.precoVendaTotalGeral, 0)

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Dashboard</h2>
        <p className="text-sm text-ink-400 mb-4">
          Visão geral das cotações no período selecionado. As cores de cada status são configuráveis na aba
          Configurações.
        </p>
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

      {loading ? (
        <div className="card text-center text-sm text-ink-400 py-10">Carregando…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile label="Cotações no período" value={String(filtrados.length)} />
            <StatTile label="Valor total das cotações" value={formatCurrency(valorTotalGeral)} />
            <StatTile label="Valor fechado (faturado)" value={formatCurrency(valorFechado)} />
          </div>

          <div className="card">
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Status das cotações</h3>
            <p className="text-xs text-ink-400 mb-4">Quantidade de cotações em cada status, no período selecionado.</p>
            <DonutChart
              data={statusData}
              centerValue={String(filtrados.length)}
              centerLabel="Cotações"
              valueFormatter={(v) => String(v)}
              emptyText="Nenhuma cotação nesse período."
            />
          </div>

          <div className="card">
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Valor por cotação</h3>
            <p className="text-xs text-ink-400 mb-4">
              As maiores cotações do período por valor (o resto agrupado em "Outros").
            </p>
            <DonutChart
              data={valoresData}
              centerValue={formatCurrency(valorTotalGeral)}
              centerLabel="Total"
              valueFormatter={formatCurrency}
              emptyText="Nenhuma cotação com valor nesse período."
            />
          </div>

          <div className="card">
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Cotações fechadas (faturado)</h3>
            <p className="text-xs text-ink-400 mb-4">Valor de cada cotação já faturada no período.</p>
            <DonutChart
              data={fechadasData}
              centerValue={formatCurrency(valorFechado)}
              centerLabel="Faturado"
              valueFormatter={formatCurrency}
              emptyText="Nenhuma cotação faturada nesse período."
            />
          </div>
        </>
      )}
    </div>
  )
}
