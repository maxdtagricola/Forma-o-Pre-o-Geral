export interface BarDatum {
  label: string
  value: number
}

/** Gráfico de barras simples (uma série) — pensado pra tendência mês a mês. */
export function BarChart({
  data,
  valueFormatter = (v: number) => String(v),
  color = '#2a78d6',
  emptyText = 'Sem dados.',
}: {
  data: BarDatum[]
  valueFormatter?: (value: number) => string
  color?: string
  emptyText?: string
}) {
  const semDados = data.length === 0 || data.every((d) => d.value === 0)
  if (semDados) {
    return <p className="text-sm text-ink-400 text-center py-8">{emptyText}</p>
  }

  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div className="flex items-end gap-2 h-40 px-1">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
          <span className="text-[11px] font-medium text-ink-700 opacity-0 group-hover:opacity-100 transition tabular-nums">
            {valueFormatter(d.value)}
          </span>
          <div
            className="w-full flex items-end h-28 rounded-t bg-ink-50 overflow-hidden"
            title={`${d.label}: ${valueFormatter(d.value)}`}
          >
            <div
              className="w-full rounded-t transition-all"
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-[10px] text-ink-400 truncate max-w-full">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export interface GroupedBarSeries {
  key: string
  label: string
  color: string
}

export interface GroupedBarDatum {
  label: string
  values: Record<string, number>
}

/** Gráfico de barras agrupadas — várias séries lado a lado por categoria, com legenda fixa. */
export function GroupedBarChart({
  data,
  series,
  valueFormatter = (v: number) => String(v),
  emptyText = 'Sem dados.',
}: {
  data: GroupedBarDatum[]
  series: GroupedBarSeries[]
  valueFormatter?: (value: number) => string
  emptyText?: string
}) {
  const semDados = data.length === 0 || data.every((d) => series.every((s) => (d.values[s.key] ?? 0) === 0))
  if (semDados) {
    return <p className="text-sm text-ink-400 text-center py-8">{emptyText}</p>
  }

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)))

  return (
    <div>
      <div className="flex items-end gap-3 h-40 px-1">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-end justify-center gap-1 h-28">
              {series.map((s) => {
                const v = d.values[s.key] ?? 0
                return (
                  <div
                    key={s.key}
                    className="flex-1 max-w-[14px] h-full flex items-end bg-ink-50 rounded-t overflow-hidden"
                    title={`${s.label} — ${d.label}: ${valueFormatter(v)}`}
                  >
                    <div
                      className="w-full rounded-t transition-all"
                      style={{ height: `${v > 0 ? Math.max(2, (v / max) * 100) : 0}%`, backgroundColor: s.color }}
                    />
                  </div>
                )
              })}
            </div>
            <span className="text-[10px] text-ink-400 truncate max-w-full">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 justify-center mt-3">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-ink-600">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  )
}
