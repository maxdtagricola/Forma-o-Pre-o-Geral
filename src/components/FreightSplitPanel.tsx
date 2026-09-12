import { useState } from 'react'
import type { QuoteItem } from '../types'

interface Grupo {
  fornecedor: string
  itemIds: string[]
  labels: string[]
  /** peso total do item (peso unitário × quantidade) */
  pesos: number[]
}

function agruparPorFornecedor(items: QuoteItem[]): Grupo[] {
  const mapa = new Map<string, Grupo>()
  items.forEach((item, index) => {
    const nome = item.product.fornecedor.trim()
    if (!nome) return
    const chave = nome.toLowerCase()
    const label = item.product.referencia || item.product.descricao || `Item ${index + 1}`
    const pesoTotal = (item.product.peso || 0) * (item.product.qtd || 0)
    const grupo = mapa.get(chave)
    if (grupo) {
      grupo.itemIds.push(item.id)
      grupo.labels.push(label)
      grupo.pesos.push(pesoTotal)
    } else {
      mapa.set(chave, { fornecedor: nome, itemIds: [item.id], labels: [label], pesos: [pesoTotal] })
    }
  })
  return Array.from(mapa.values()).filter((g) => g.itemIds.length > 1)
}

export function FreightSplitPanel({
  items,
  onApply,
}: {
  items: QuoteItem[]
  onApply: (valores: Record<string, number>) => void
}) {
  const grupos = agruparPorFornecedor(items)
  const [totais, setTotais] = useState<Record<string, number>>({})

  if (grupos.length === 0) return null

  function handleRatear(grupo: Grupo) {
    const total = totais[grupo.fornecedor] || 0
    if (total <= 0) {
      alert('Informe o valor total do frete desse fornecedor pra ratear.')
      return
    }
    const somaPesos = grupo.pesos.reduce((s, p) => s + p, 0)
    const valores: Record<string, number> = {}
    if (somaPesos > 0) {
      grupo.itemIds.forEach((id, i) => {
        valores[id] = Math.round(total * (grupo.pesos[i] / somaPesos) * 100) / 100
      })
    } else {
      const parte = Math.round((total / grupo.itemIds.length) * 100) / 100
      grupo.itemIds.forEach((id) => {
        valores[id] = parte
      })
    }
    onApply(valores)
  }

  return (
    <div className="card">
      <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Ratear frete por fornecedor</h2>
      <p className="text-sm text-ink-400 mb-4">
        Detectamos itens com o mesmo fornecedor. Informe o frete total cobrado por ele e divida entre os itens — por
        peso quando cadastrado, ou em partes iguais. O valor é aplicado no campo "Frete adicional" de cada item.
      </p>
      <div className="space-y-3">
        {grupos.map((grupo) => (
          <div key={grupo.fornecedor} className="rounded-xl border border-ink-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink-900 truncate">{grupo.fornecedor}</p>
                <p className="text-xs text-ink-400 truncate">
                  {grupo.itemIds.length} itens: {grupo.labels.join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-sm">
                    R$
                  </span>
                  <input
                    type="number"
                    className="field-input field-input-mono pl-9 w-36"
                    placeholder="Frete total"
                    step={0.01}
                    min={0}
                    value={totais[grupo.fornecedor] ?? ''}
                    onChange={(e) =>
                      setTotais((prev) => ({ ...prev, [grupo.fornecedor]: e.target.valueAsNumber || 0 }))
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRatear(grupo)}
                  className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition whitespace-nowrap"
                >
                  Ratear
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
