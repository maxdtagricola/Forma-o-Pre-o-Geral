import { COR_OUTROS, PALETA_CATEGORICA, corTexto } from '../statusColors'

export interface DonutDatum {
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

export function DonutChart({
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
        {segmentos.map((s, i) => s.path && <path key={i} d={s.path} fill={s.color} />)}
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
        <circle cx={cx} cy={cy} r={rInner - 6} style={{ fill: 'rgb(var(--surface))' }} />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="20" fontWeight="700" style={{ fill: 'rgb(var(--ink-900))' }}>
          {centerValue}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" style={{ fill: 'rgb(var(--ink-400))' }}>
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
export function limitarComOutros(
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
