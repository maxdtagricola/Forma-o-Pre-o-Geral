import { useMemo } from 'react'
import { calculateMarginRange } from '../calc/marginAnalysis'
import { formatCurrency, formatNumber, formatPercent } from '../utils'
import type { PricingConfig, ProductInput } from '../types'

export function MarginAnalysisPage({ product, pricing }: { product: ProductInput; pricing: PricingConfig }) {
  const pontos = useMemo(() => calculateMarginRange(product, pricing), [product, pricing])
  const maxPreco = useMemo(() => Math.max(...pontos.map((p) => p.precoVendaUnitario), 1), [pontos])

  const semProduto = !product.ncm && !product.valorUnt

  if (semProduto) {
    return (
      <div className="card text-center py-12">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Nenhum produto para analisar</h2>
        <p className="text-sm text-ink-400">Preencha os dados do produto na aba Início para ver a análise de margens.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Análise de margens</h2>
        <p className="text-sm text-ink-400 mb-5">
          Comparação do preço de venda de <strong className="text-ink-600">{product.descricao || product.referencia || 'produto atual'}</strong> de
          10% a 50% de margem de lucro, em passos de 1%.
        </p>

        <div className="space-y-1.5">
          {pontos
            .filter((_, i) => i % 2 === 0 || Math.abs(pontos[i].margemPct - pricing.lucroPct) < 1e-6)
            .map((p) => {
              const isCurrent = Math.abs(p.margemPct - pricing.lucroPct) < 1e-6
              const widthPct = Math.max(2, (p.precoVendaUnitario / maxPreco) * 100)
              return (
                <div key={p.margemPct} className="flex items-center gap-3">
                  <span
                    className={`w-12 shrink-0 text-xs font-mono tabular-nums ${
                      isCurrent ? 'text-brand-700 font-semibold' : 'text-ink-400'
                    }`}
                  >
                    {formatPercent(p.margemPct, 0)}
                  </span>
                  <div className="flex-1 h-6 rounded-md bg-ink-100 overflow-hidden">
                    <div
                      className={`h-full rounded-md ${isCurrent ? 'bg-brand-600' : 'bg-ink-300'}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span
                    className={`w-24 shrink-0 text-right text-xs font-mono tabular-nums ${
                      isCurrent ? 'text-ink-900 font-semibold' : 'text-ink-500'
                    }`}
                  >
                    {formatCurrency(p.precoVendaUnitario)}
                  </span>
                </div>
              )
            })}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-400 border-b border-ink-100">
              <th className="py-2 pr-4 font-medium">Margem</th>
              <th className="py-2 pr-4 font-medium text-right">Custo unitário</th>
              <th className="py-2 pr-4 font-medium text-right">Preço unitário</th>
              <th className="py-2 pr-4 font-medium text-right">Preço total</th>
              <th className="py-2 pr-4 font-medium text-right">Lucro (R$)</th>
              <th className="py-2 font-medium text-right">Markup</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => {
              const isCurrent = Math.abs(p.margemPct - pricing.lucroPct) < 1e-6
              return (
                <tr
                  key={p.margemPct}
                  className={`border-b border-ink-50 last:border-0 ${isCurrent ? 'bg-brand-50' : ''}`}
                >
                  <td className={`py-2 pr-4 font-mono tabular-nums ${isCurrent ? 'font-semibold text-brand-700' : 'text-ink-600'}`}>
                    {formatPercent(p.margemPct, 0)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums text-right text-ink-500">
                    {formatCurrency(p.custoUnitario)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums text-right text-ink-800">
                    {formatCurrency(p.precoVendaUnitario)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums text-right text-ink-800">
                    {formatCurrency(p.precoVendaTotal)}
                  </td>
                  <td className="py-2 pr-4 font-mono tabular-nums text-right text-ink-500">
                    {formatCurrency(p.lucroValor)}
                  </td>
                  <td className="py-2 font-mono tabular-nums text-right text-ink-500">
                    {formatNumber(p.markup, 2)}x
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
