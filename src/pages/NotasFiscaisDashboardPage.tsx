import { useEffect, useMemo, useState } from 'react'
import { DonutChart, limitarComOutros, type DonutDatum } from '../components/DonutChart'
import { GroupedBarChart } from '../components/BarChart'
import { KpiCard, IconCaminhao, IconDocumento, IconTendencia } from '../components/KpiCard'
import { listNotasFiscais } from '../db/notasFiscaisRepo'
import { getStatusColors } from '../db/configRepo'
import { corPadraoDoStatus } from '../statusColors'
import { formatCurrency } from '../utils'
import { PERIODOS, inicioPeriodo, type Periodo } from '../periodo'
import { NOTA_FISCAL_STATUSES, NOTA_FISCAL_TIPOS } from '../types'
import type { NotaFiscal, NotaFiscalTipo } from '../types'
import { chaveMesDaNota, labelCurtoDoMes, corDoTipo, labelDoTipo } from '../notasFiscaisHelpers'

const tipoOptions = NOTA_FISCAL_TIPOS

/** Versão curta do valor pra caber dentro da fatia do gráfico (a legenda ao lado mostra o valor completo). */
function formatCurrencyCompacto(v: number): string {
  if (Math.abs(v) < 1000) return formatCurrency(v)
  return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
}

/** Mesmo layout do Dashboard de cotações (ver AnalyticsPage): título + KPIs coloridos no topo,
 * sidebar de filtros com o donut de status compacto, área principal com o resto dos gráficos. */
export function NotasFiscaisDashboardPage() {
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [loading, setLoading] = useState(true)
  const [coresStatus, setCoresStatus] = useState<Record<string, string>>({})
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | NotaFiscalTipo>('TODOS')

  useEffect(() => {
    setLoading(true)
    listNotasFiscais()
      .then(setNotas)
      .catch((err) => {
        alert(err instanceof Error ? err.message : 'Erro ao carregar notas fiscais do servidor.')
      })
      .finally(() => setLoading(false))
    getStatusColors()
      .then(setCoresStatus)
      .catch(() => {
        // cores customizadas são só um extra visual — se o servidor falhar, usa a paleta padrão
      })
  }, [])

  function corDoStatus(status: string): string {
    return coresStatus[status] || corPadraoDoStatus(status, NOTA_FISCAL_STATUSES)
  }

  const notasDoPeriodo = useMemo(() => {
    const inicio = inicioPeriodo(periodo)
    return notas.filter(
      (n) => n.createdAt >= inicio && (tipoFiltro === 'TODOS' || (n.tipo ?? 'PECAS') === tipoFiltro),
    )
  }, [notas, periodo, tipoFiltro])

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

  // registros por mês (últimos 6 meses de referência), diferenciando peças de implementos —
  // tendência independente do período selecionado acima
  const notasPorMesData = useMemo(() => {
    const porMes = new Map<string, Record<NotaFiscalTipo, { quantidade: number; valor: number }>>()
    for (const n of notas) {
      const chave = chaveMesDaNota(n)
      const tipo: NotaFiscalTipo = n.tipo ?? 'PECAS'
      if (!porMes.has(chave)) {
        porMes.set(chave, { PECAS: { quantidade: 0, valor: 0 }, IMPLEMENTOS: { quantidade: 0, valor: 0 } })
      }
      const atual = porMes.get(chave)![tipo]
      atual.quantidade += 1
      atual.valor += n.valorNota
    }
    return Array.from(porMes.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-6)
      .map(([mesKey, porTipo]) => ({ mesKey, porTipo }))
  }, [notas])

  const tipoSeries = tipoOptions.map((t) => ({ key: t.value, label: t.label, color: corDoTipo(t.value) }))

  const registrosPorMesChartData = notasPorMesData.map((d) => ({
    label: labelCurtoDoMes(d.mesKey),
    values: { PECAS: d.porTipo.PECAS.quantidade, IMPLEMENTOS: d.porTipo.IMPLEMENTOS.quantidade },
  }))

  const valoresPorMesChartData = notasPorMesData.map((d) => ({
    label: labelCurtoDoMes(d.mesKey),
    values: { PECAS: d.porTipo.PECAS.valor, IMPLEMENTOS: d.porTipo.IMPLEMENTOS.valor },
  }))

  const tipoFiltroOptions = ['TODOS', ...tipoOptions.map((t) => t.value)] as const

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink-900">Dashboard de Transferências</h2>
          <p className="text-sm text-ink-400">Visão geral das notas fiscais de transferência</p>
        </div>
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full sm:w-auto">
            <KpiCard icon={<IconDocumento />} value={String(notasDoPeriodo.length)} label="Notas no período" tone="agua" />
            <KpiCard icon={<IconTendencia />} value={formatCurrency(valorTotalNotas)} label="Valor total das notas" tone="amarelo" />
            <KpiCard icon={<IconCaminhao />} value={formatCurrency(valorTotalFrete)} label="Valor total de frete" tone="laranja" />
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
              <p className="field-label mb-1.5">Tipo</p>
              <div className="flex flex-wrap gap-2">
                {tipoFiltroOptions.map((valor) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setTipoFiltro(valor)}
                    className={`pill-tab border ${
                      tipoFiltro === valor
                        ? 'bg-ink-950 border-ink-950 text-white'
                        : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    {valor === 'TODOS' ? 'Todos' : labelDoTipo(valor)}
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Status das notas</h3>
              <p className="text-xs text-ink-400 mb-4">Quantidade em cada status, no período selecionado.</p>
              <DonutChart
                data={statusData}
                centerValue={String(notasDoPeriodo.length)}
                centerLabel="Notas"
                valueFormatter={(v) => String(v)}
                emptyText="Nenhuma nota nesse período."
                compact
              />
            </div>
          </div>

          <div className="space-y-6">
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
                chartValueFormatter={formatCurrencyCompacto}
                emptyText="Nenhuma nota com valor nesse período."
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Registros por mês</h3>
                <p className="text-xs text-ink-400 mb-4">Peças x implementos, últimos meses.</p>
                <GroupedBarChart
                  data={registrosPorMesChartData}
                  series={tipoSeries}
                  valueFormatter={(v) => String(v)}
                  emptyText="Nenhuma nota registrada ainda."
                />
              </div>

              <div className="card">
                <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Valores do mês</h3>
                <p className="text-xs text-ink-400 mb-4">Peças x implementos, últimos meses.</p>
                <GroupedBarChart
                  data={valoresPorMesChartData}
                  series={tipoSeries}
                  valueFormatter={formatCurrency}
                  chartValueFormatter={formatCurrencyCompacto}
                  emptyText="Nenhuma nota registrada ainda."
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
