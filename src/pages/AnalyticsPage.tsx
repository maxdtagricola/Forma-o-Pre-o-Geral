import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { listQuotes } from '../db/analysesRepo'
import { getStatusColors } from '../db/configRepo'
import { SelectField } from '../components/ui/Field'
import { formatCurrency } from '../utils'
import { COR_OUTROS, PALETA_CATEGORICA, corPadraoDoStatus } from '../statusColors'
import { DonutChart, limitarComOutros, type DonutDatum } from '../components/DonutChart'
import { LineChart, type LineDatum, type LineSeries } from '../components/LineChart'
import { BarChart, type BarDatum } from '../components/BarChart'
import { PERIODOS, inicioPeriodo, type Periodo } from '../periodo'
import { QUOTE_STATUSES, VENDEDORES } from '../types'
import type { QuoteRecord } from '../types'

const NOMES_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Os últimos `n` meses (o atual incluso), do mais antigo pro mais recente — janela fixa, não
 * segue o filtro de Período da página, senão o gráfico de tendência fica sem graça no "Mês". */
function ultimosMeses(n: number): { inicio: number; fim: number; label: string }[] {
  const agora = new Date()
  const meses: { inicio: number; fim: number; label: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    meses.push({ inicio: d.getTime(), fim: fim.getTime(), label: `${NOMES_MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` })
  }
  return meses
}

function IconCotacoes() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  )
}
function IconValor() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </svg>
  )
}
function IconFaturado() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

const TONS_KPI: Record<'agua' | 'amarelo' | 'laranja', string> = {
  agua: 'bg-[#1baf7a]',
  amarelo: 'bg-[#eda100]',
  laranja: 'bg-[#eb6834]',
}

function KpiCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: ReactNode
  value: string
  label: string
  tone: keyof typeof TONS_KPI
}) {
  return (
    <div className={`rounded-2xl px-4 py-3.5 text-white flex items-center gap-3 ${TONS_KPI[tone]}`}>
      <div className="shrink-0 opacity-90">{icon}</div>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold leading-tight truncate">{value}</p>
        <p className="text-xs text-white/85 truncate">{label}</p>
      </div>
    </div>
  )
}

export function AnalyticsPage() {
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [vendedorFiltro, setVendedorFiltro] = useState('')
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
    return records.filter((r) => r.createdAt >= inicio && (!vendedorFiltro || r.vendedor === vendedorFiltro))
  }, [records, periodo, vendedorFiltro])

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

  const valorTotalGeral = filtrados.reduce((s, r) => s + r.summary.precoVendaTotalGeral, 0)
  const fechadas = useMemo(() => filtrados.filter((r) => r.status === 'FATURADO'), [filtrados])
  const valorFechado = fechadas.reduce((s, r) => s + r.summary.precoVendaTotalGeral, 0)
  const ticketMedio = filtrados.length > 0 ? valorTotalGeral / filtrados.length : 0

  const meses = useMemo(() => ultimosMeses(6), [])
  const { tendenciaData, tendenciaSeries } = useMemo(() => {
    const base = vendedorFiltro ? records.filter((r) => r.vendedor === vendedorFiltro) : records
    const contagemPorStatus = new Map<string, number>()
    for (const r of base) contagemPorStatus.set(r.status, (contagemPorStatus.get(r.status) ?? 0) + 1)
    const statusOrdenados = Array.from(contagemPorStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s)
    const principais = statusOrdenados.slice(0, 3)
    const temOutros = statusOrdenados.length > 3
    const series: LineSeries[] = principais.map((s, i) => ({
      key: s,
      label: s,
      color: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length],
    }))
    if (temOutros) series.push({ key: '__outros', label: 'Outros', color: COR_OUTROS })

    const data: LineDatum[] = meses.map(({ inicio, fim, label }) => {
      const doMes = base.filter((r) => r.createdAt >= inicio && r.createdAt < fim)
      const values: Record<string, number> = {}
      for (const s of principais) values[s] = doMes.filter((r) => r.status === s).length
      if (temOutros) values.__outros = doMes.filter((r) => !principais.includes(r.status)).length
      return { label, values }
    })
    return { tendenciaData: data, tendenciaSeries: series }
  }, [records, vendedorFiltro, meses])

  const vendedorData: BarDatum[] = useMemo(
    () =>
      VENDEDORES.map((v) => ({
        label: v,
        value: filtrados.filter((r) => r.vendedor === v).reduce((s, r) => s + r.summary.precoVendaTotalGeral, 0),
      })).filter((d) => d.value > 0),
    [filtrados],
  )

  const vendedorOptions = [{ value: '', label: 'Todos' }, ...VENDEDORES.map((v) => ({ value: v, label: v }))]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink-900">Dashboard</h2>
          <p className="text-sm text-ink-400">Visão geral das cotações</p>
        </div>
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full sm:w-auto">
            <KpiCard icon={<IconCotacoes />} value={String(filtrados.length)} label="Cotações no período" tone="agua" />
            <KpiCard icon={<IconValor />} value={formatCurrency(valorTotalGeral)} label="Valor total das cotações" tone="amarelo" />
            <KpiCard icon={<IconFaturado />} value={formatCurrency(valorFechado)} label="Valor faturado" tone="laranja" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="card text-center text-sm text-ink-400 py-10">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          <div className="space-y-6">
            <div className="card">
              <h3 className="font-display text-sm font-semibold text-ink-900 mb-3">Filtros</h3>
              <p className="field-label mb-1.5">Período</p>
              <div className="flex flex-wrap gap-2 mb-4">
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
              <SelectField label="Vendedor" value={vendedorFiltro} onChange={setVendedorFiltro} options={vendedorOptions} />
            </div>

            <div className="card">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Status das cotações</h3>
              <p className="text-xs text-ink-400 mb-4">Quantidade em cada status, no período selecionado.</p>
              <DonutChart
                data={statusData}
                centerValue={String(filtrados.length)}
                centerLabel="Cotações"
                valueFormatter={(v) => String(v)}
                emptyText="Nenhuma cotação nesse período."
                compact
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="card">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Cotações por mês</h3>
              <p className="text-xs text-ink-400 mb-4">
                Últimos 6 meses, pelos status mais frequentes{vendedorFiltro ? ` de ${vendedorFiltro}` : ''}.
              </p>
              <LineChart
                data={tendenciaData}
                series={tendenciaSeries}
                valueFormatter={(v) => String(v)}
                emptyText="Nenhuma cotação registrada ainda."
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Valor por vendedor</h3>
                <p className="text-xs text-ink-400 mb-4">No período selecionado.</p>
                <BarChart data={vendedorData} valueFormatter={formatCurrency} color="#2a78d6" emptyText="Nenhuma cotação com vendedor definido nesse período." />
              </div>

              <div className="card flex flex-col justify-center">
                <p className="text-sm text-ink-400 mb-1">Valor faturado no período</p>
                <p className="font-display text-4xl font-bold text-ink-900 tabular-nums">{formatCurrency(valorFechado)}</p>
                <div className="mt-3 pt-3 border-t border-ink-100 text-sm text-ink-500 space-y-1">
                  <p>{fechadas.length} cotaç{fechadas.length === 1 ? 'ão faturada' : 'ões faturadas'}</p>
                  <p>
                    Ticket médio: <span className="font-mono text-ink-800">{formatCurrency(ticketMedio)}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
