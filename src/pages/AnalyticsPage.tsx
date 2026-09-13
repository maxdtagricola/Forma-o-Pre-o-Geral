import { useEffect, useMemo, useState } from 'react'
import { listQuotes } from '../db/analysesRepo'
import { getStatusColors, setStatusColor } from '../db/configRepo'
import { formatCurrency } from '../utils'
import { COR_OUTROS, PALETA_CATEGORICA, corPadraoDoStatus, corTexto } from '../statusColors'
import { QUOTE_STATUSES } from '../types'
import type { QuoteRecord } from '../types'

type Periodo = 'mes' | 'bimestre' | 'semestre' | 'anual'

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'mes', label: 'Mês' },
  { value: 'bimestre', label: 'Bimestre' },
  { value: 'semestre', label: 'Semestre' },
  { value: 'anual', label: 'Anual' },
]

function inicioPeriodo(periodo: Periodo): number {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = agora.getMonth()
  if (periodo === 'mes') return new Date(ano, mes, 1).getTime()
  if (periodo === 'bimestre') return new Date(ano, mes - (mes % 2), 1).getTime()
  if (periodo === 'semestre') return new Date(ano, mes < 6 ? 0 : 6, 1).getTime()
  return new Date(ano, 0, 1).getTime()
}

interface DonutDatum {
  label: string
  value: number
  color: string
  title?: string
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) }
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(cx, cy, rOuter, startAngle)
  const endOuter = polarToCartesian(cx, cy, rOuter, endAngle)
  const startInner = polarToCartesian(cx, cy, rInner, startAngle)
  const endInner = polarToCartesian(cx, cy, rInner, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ')
}

function DonutChart({
  data,
  centerLabel,
  centerValue,
  valueFormatter,
  emptyText,
}: {
  data: DonutDatum[]
  centerLabel: string
  centerValue: string
  valueFormatter: (v: number) => string
  emptyText: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total <= 0) {
    return <p className="text-sm text-ink-400 text-center py-8">{emptyText}</p>
  }

  const size = 240
  const cx = size / 2
  const cy = size / 2
  const rOuter = 110
  const rInner = 66
  const gapDeg = 1.5

  let angle = 0
  const segmentos = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const sweep = (d.value / total) * 360
      const start = angle + gapDeg / 2
      const end = angle + sweep - gapDeg / 2
      const mid = (start + end) / 2
      angle += sweep
      return {
        ...d,
        path: end > start ? arcPath(cx, cy, rOuter, rInner, start, end) : null,
        labelPos: polarToCartesian(cx, cy, (rOuter + rInner) / 2, mid),
        sweep,
      }
    })

  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {segmentos.map(
          (s, i) => s.path && <path key={i} d={s.path} fill={s.color} />,
        )}
        {segmentos.map(
          (s, i) =>
            s.sweep > 14 && (
              <text
                key={i}
                x={s.labelPos.x}
                y={s.labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="15"
                fontWeight="700"
                fill={corTexto(s.color)}
              >
                {typeof s.value === 'number' && Number.isInteger(s.value) ? s.value : ''}
              </text>
            ),
        )}
        <circle cx={cx} cy={cy} r={rInner - 6} fill="#fcfcfb" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="#0b0b0b">
          {centerValue}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="#898781">
          {centerLabel}
        </text>
      </svg>

      <div className="flex-1 min-w-0 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {data
          .filter((d) => d.value > 0)
          .map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs" title={d.title}>
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-ink-600 truncate flex-1">{d.label}</span>
              <span className="font-mono tabular-nums text-ink-800 shrink-0">{valueFormatter(d.value)}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

/** Agrupa em "no máximo N + Outros" pra caber na paleta categórica sem estourar 8 fatias. */
function limitarComOutros(
  itens: { label: string; value: number; title?: string }[],
  maxIndividuais: number,
): DonutDatum[] {
  const ordenado = itens.slice().sort((a, b) => b.value - a.value)
  const individuais = ordenado.slice(0, maxIndividuais)
  const resto = ordenado.slice(maxIndividuais)
  const resultado: DonutDatum[] = individuais.map((it, i) => ({
    ...it,
    color: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length],
  }))
  if (resto.length > 0) {
    resultado.push({
      label: `Outros (${resto.length})`,
      value: resto.reduce((s, it) => s + it.value, 0),
      color: COR_OUTROS,
    })
  }
  return resultado
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-400 mb-1">{label}</p>
      <p className="font-display text-2xl font-semibold text-ink-900">{value}</p>
    </div>
  )
}

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

  async function handleCorStatusChange(status: string, cor: string) {
    setCoresStatus((prev) => ({ ...prev, [status]: cor }))
    try {
      await setStatusColor(status, cor)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar a cor no servidor.')
    }
  }

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
        <p className="text-sm text-ink-400 mb-4">Visão geral das cotações no período selecionado.</p>
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriodo(p.value)}
              className={`pill-tab border ${
                periodo === p.value
                  ? 'bg-ink-900 border-ink-900 text-white'
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
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Cores dos status</h3>
            <p className="text-xs text-ink-400 mb-4">
              Escolha a cor de cada status — vale pra todos os admins, salvo no servidor.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {QUOTE_STATUSES.map((status) => (
                <label
                  key={status}
                  className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-xs text-ink-700"
                >
                  <input
                    type="color"
                    value={coresStatus[status] || corPadraoDoStatus(status)}
                    onChange={(e) => handleCorStatusChange(status, e.target.value)}
                    className="h-6 w-8 shrink-0 cursor-pointer rounded border border-ink-200 p-0"
                  />
                  <span className="truncate">{status}</span>
                </label>
              ))}
            </div>
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
