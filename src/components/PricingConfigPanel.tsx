import { useState } from 'react'
import { PercentField } from './ui/Field'
import { MARGENS_RAPIDAS } from '../types'
import type { PricingConfig } from '../types'
import { formatPercent } from '../utils'

export function PricingConfigPanel({
  pricing,
  onChange,
}: {
  pricing: PricingConfig
  onChange: (patch: Partial<PricingConfig>) => void
}) {
  const [showOutros, setShowOutros] = useState(pricing.outrosPct > 0)

  return (
    <div className="card">
      <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Formação de preço</h2>
      <p className="text-sm text-ink-400 mb-5">
        Imposto federal, comissão e custo fixo agora são definidos na aba Configurações, valendo pra todas as
        cotações.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PercentField
          label="Lucro / margem de lucro"
          value={pricing.lucroPct}
          onChange={(v) => onChange({ lucroPct: v })}
        />
      </div>

      {showOutros ? (
        <div className="mt-4">
          <PercentField label="Outros" value={pricing.outrosPct} onChange={(v) => onChange({ outrosPct: v })} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowOutros(true)}
          className="mt-3 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          + Adicionar componente "Outros"
        </button>
      )}

      <div className="mt-6 border-t border-ink-100 pt-5">
        <p className="field-label mb-2">Margens rápidas</p>
        <div className="flex flex-wrap gap-2">
          {MARGENS_RAPIDAS.map((m) => {
            const active = Math.abs(m - pricing.lucroPct) < 1e-6
            return (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ lucroPct: m })}
                className={`pill-tab border ${
                  active
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-ink-200 text-ink-600 hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                {formatPercent(m, 0)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
