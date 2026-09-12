import { useMemo } from 'react'
import { ProductForm } from '../components/ProductForm'
import { PricingConfigPanel } from '../components/PricingConfigPanel'
import { ResultPanel } from '../components/ResultPanel'
import { QuoteItemsList } from '../components/QuoteItemsList'
import { Button } from '../components/ui/Basics'
import { calculateItem } from '../calc/calculator'
import { formatCurrency } from '../utils'
import type { CalculationResult, PricingConfig, ProductInput, QuoteItem } from '../types'

export function Dashboard({
  items,
  activeItemId,
  activeProduct,
  activePricing,
  result,
  isEditing,
  onSelectItem,
  onAddItem,
  onRemoveItem,
  onProductChange,
  onPricingChange,
  onSave,
  onNew,
}: {
  items: QuoteItem[]
  activeItemId: string
  activeProduct: ProductInput
  activePricing: PricingConfig
  result: CalculationResult
  isEditing: boolean
  onSelectItem: (id: string) => void
  onAddItem: () => void
  onRemoveItem: (id: string) => void
  onProductChange: (patch: Partial<ProductInput>) => void
  onPricingChange: (patch: Partial<PricingConfig>) => void
  onSave: () => void
  onNew: () => void
}) {
  const totalGeral = useMemo(
    () => items.reduce((sum, item) => sum + calculateItem(item.product, item.pricing).precoVendaTotal, 0),
    [items],
  )

  return (
    <div className="space-y-6">
      <QuoteItemsList
        items={items}
        activeItemId={activeItemId}
        onSelect={onSelectItem}
        onAdd={onAddItem}
        onRemove={onRemoveItem}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <ProductForm key={activeItemId} product={activeProduct} onChange={onProductChange} />
          <PricingConfigPanel key={activeItemId} pricing={activePricing} onChange={onPricingChange} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="sticky top-6 space-y-4">
            <ResultPanel result={result} qtd={activeProduct.qtd || 1} />

            {items.length > 1 && (
              <div className="card flex items-center justify-between">
                <span className="text-sm text-ink-500">Total da cotação ({items.length} itens)</span>
                <span className="font-mono font-semibold text-ink-900 tabular-nums">{formatCurrency(totalGeral)}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={onSave}>
                {isEditing ? 'Atualizar cotação' : 'Salvar no histórico'}
              </Button>
              {isEditing && (
                <Button variant="secondary" onClick={onNew}>
                  Nova cotação
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
