import { useEffect, useMemo, useState } from 'react'
import { DonutChart, limitarComOutros, type DonutDatum } from '../components/DonutChart'
import { GroupedBarChart } from '../components/BarChart'
import { StatTile } from '../components/StatTile'
import { listNotasFiscais } from '../db/notasFiscaisRepo'
import { getStatusColors } from '../db/configRepo'
import { corPadraoDoStatus } from '../statusColors'
import { formatCurrency } from '../utils'
import { PERIODOS, inicioPeriodo, type Periodo } from '../periodo'
import { NOTA_FISCAL_STATUSES, NOTA_FISCAL_TIPOS } from '../types'
import type { NotaFiscal, NotaFiscalTipo } from '../types'
import { chaveMesDaNota, labelCurtoDoMes, corDoTipo, labelDoTipo } from '../notasFiscaisHelpers'

const tipoOptions = NOTA_FISCAL_TIPOS

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

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Dashboard de notas fiscais</h2>
        <div className="flex flex-wrap gap-2 mb-3">
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
        <div className="flex flex-wrap gap-2">
          {(['TODOS', ...tipoOptions.map((t) => t.value)] as const).map((valor) => (
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
              {valor === 'TODOS' ? 'Todos os tipos' : labelDoTipo(valor)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
      ) : (
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Registros por mês</h3>
              <p className="text-xs text-ink-400 mb-4">
                Quantidade de notas por mês de referência (emissão), peças x implementos, últimos meses.
              </p>
              <GroupedBarChart
                data={registrosPorMesChartData}
                series={tipoSeries}
                valueFormatter={(v) => String(v)}
                emptyText="Nenhuma nota registrada ainda."
              />
            </div>

            <div className="card">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Valores do mês</h3>
              <p className="text-xs text-ink-400 mb-4">
                Soma do valor das notas por mês de referência (emissão), peças x implementos, últimos meses.
              </p>
              <GroupedBarChart
                data={valoresPorMesChartData}
                series={tipoSeries}
                valueFormatter={formatCurrency}
                emptyText="Nenhuma nota registrada ainda."
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
