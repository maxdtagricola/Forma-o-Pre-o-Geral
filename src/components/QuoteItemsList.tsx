import { calculateItem } from '../calc/calculator'
import { formatCurrency } from '../utils'
import type { QuoteItem } from '../types'

export function QuoteItemsList({
  items,
  activeItemId,
  onSelect,
  onAdd,
  onRemove,
}: {
  items: QuoteItem[]
  activeItemId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Itens da cotação</h2>
          <p className="text-sm text-ink-400">Adicione quantos produtos precisar — cada um calcula separado.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
        >
          + Adicionar item
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => {
          const isActive = item.id === activeItemId
          const label = item.product.referencia || item.product.descricao || `Item ${index + 1}`
          const result = calculateItem(item.product, item.pricing)
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-full pl-1 pr-1 py-1 text-sm border transition ${
                isActive ? 'bg-ink-950 text-white border-ink-950' : 'bg-surface text-ink-600 border-ink-200 hover:border-ink-300'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex items-center gap-2 pl-3 pr-1 py-1"
              >
                <span className="font-medium truncate max-w-[10rem]">{label}</span>
                <span className={`font-mono text-xs tabular-nums ${isActive ? 'text-white/60' : 'text-ink-400'}`}>
                  {formatCurrency(result.precoVendaTotal)}
                </span>
              </button>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label="Remover item"
                  className={`h-6 w-6 shrink-0 rounded-full text-xs leading-none transition ${
                    isActive ? 'hover:bg-white/20' : 'hover:bg-ink-100'
                  }`}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
