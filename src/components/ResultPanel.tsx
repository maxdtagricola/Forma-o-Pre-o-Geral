import type { CalculationResult } from '../types'
import { Badge } from './ui/Basics'
import { formatCurrency, formatNumber, formatPercent } from '../utils'

const CLASS_TONE: Record<CalculationResult['classificacaoIcms'], 'brand' | 'amber' | 'danger' | 'neutral'> = {
  Normal: 'neutral',
  RBC: 'brand',
  ST: 'amber',
  'ST RET': 'amber',
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-ink-100 last:border-0">
      <span className={`text-sm ${muted ? 'text-ink-400' : 'text-ink-600'}`}>{label}</span>
      <span className="font-mono text-sm tabular-nums text-ink-800">{value}</span>
    </div>
  )
}

export function ResultPanel({ result, qtd }: { result: CalculationResult; qtd: number }) {
  const { breakdown } = result

  if (!result.viavel) {
    return (
      <div className="card border-rose-200 bg-rose-50">
        <h2 className="font-display text-lg font-semibold text-rose-800 mb-1">Margem inviável</h2>
        <p className="text-sm text-rose-700">
          A soma dos percentuais de custo, impostos e lucro ultrapassa 100% do preço de venda. Reduza algum
          componente de formação de preço para obter um resultado válido.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge tone={CLASS_TONE[result.classificacaoIcms]}>ICMS: {result.classificacaoIcms}</Badge>
        <Badge tone={result.classificacaoPisCofins === 'Mono' ? 'brand' : 'neutral'}>
          PIS/COFINS: {result.classificacaoPisCofins}
        </Badge>
      </div>

      <div className="rounded-xl bg-ink-950 text-white p-5 mb-5">
        <p className="text-white/60 text-sm mb-1">Preço de venda (unitário)</p>
        <p className="font-mono text-3xl sm:text-4xl font-semibold tabular-nums">
          {formatCurrency(result.precoVendaUnitario)}
        </p>
        <div className="mt-3 flex items-center justify-between text-sm text-white/60">
          <span>
            Total ({formatNumber(qtd, 0)} un.): <span className="text-white font-mono">{formatCurrency(result.precoVendaTotal)}</span>
          </span>
          <span>Markup {formatNumber(result.markupMultiplicador, 3)}x</span>
        </div>
      </div>

      <div>
        <Row label="Custo final" value={formatCurrency(result.custoUnitario)} muted />
        <Row label="Frete (total)" value={formatCurrency(result.freteCalculado)} muted />
        <Row label="Imposto federal" value={formatCurrency(breakdown.impFed / qtd)} />
        {breakdown.outros > 0 && <Row label="Outros" value={formatCurrency(breakdown.outros / qtd)} />}
        <Row label="Comissão" value={formatCurrency(breakdown.comissao / qtd)} />
        <Row label="Custo fixo" value={formatCurrency(breakdown.custoFixo / qtd)} />
        <Row label="Lucro" value={formatCurrency(breakdown.lucro / qtd)} />
        {breakdown.pis > 0 && <Row label="PIS" value={formatCurrency(breakdown.pis / qtd)} />}
        {breakdown.cofins > 0 && <Row label="COFINS" value={formatCurrency(breakdown.cofins / qtd)} />}
        {breakdown.icmsRo > 0 && <Row label="ICMS (RO)" value={formatCurrency(breakdown.icmsRo / qtd)} />}
        {(result.classificacaoIcms === 'ST' || result.classificacaoIcms === 'ST RET') && (
          <Row label="ICMS Substituição (custo)" value={formatCurrency(result.icmsSubstituicao)} muted />
        )}
      </div>

      {result.mva !== null && (
        <p className="mt-4 text-xs text-ink-400">MVA ajustada aplicada: {formatPercent(result.mva)}</p>
      )}
    </div>
  )
}
