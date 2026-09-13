import { useMemo } from 'react'
import { ProductForm } from '../components/ProductForm'
import { PricingConfigPanel } from '../components/PricingConfigPanel'
import { ResultPanel } from '../components/ResultPanel'
import { QuoteItemsList } from '../components/QuoteItemsList'
import { FreightSplitPanel } from '../components/FreightSplitPanel'
import { Button } from '../components/ui/Basics'
import { SelectField, TextField } from '../components/ui/Field'
import { calculateItem } from '../calc/calculator'
import { formatCurrency } from '../utils'
import { TIPOS_REFERENCIA, VENDEDORES } from '../types'
import type { CalculationResult, PricingConfig, ProductInput, QuoteItem, QuoteStatus, TipoReferencia } from '../types'

const vendedorOptions = [{ value: '', label: '— selecione —' }, ...VENDEDORES.map((v) => ({ value: v, label: v }))]
const tipoReferenciaOptions = TIPOS_REFERENCIA.map((t) => ({ value: t.value, label: t.label }))

export function Dashboard({
  currentAdmin,
  activeStatus,
  activeResponsavel,
  vendedor,
  tipoReferencia,
  cliente,
  maquina,
  onVendedorChange,
  onTipoReferenciaChange,
  onClienteChange,
  onMaquinaChange,
  items,
  activeItemId,
  activeProduct,
  activePricing,
  result,
  isEditing,
  onSelectItem,
  onAddItem,
  onRemoveItem,
  onApplyFreightSplit,
  onProductChange,
  onPricingChange,
  onSave,
  onNew,
  onGoToCotacoes,
}: {
  currentAdmin: string
  activeStatus: QuoteStatus
  activeResponsavel: string
  vendedor: string
  tipoReferencia: TipoReferencia
  cliente: string
  maquina: string
  onVendedorChange: (value: string) => void
  onTipoReferenciaChange: (value: TipoReferencia) => void
  onClienteChange: (value: string) => void
  onMaquinaChange: (value: string) => void
  items: QuoteItem[]
  activeItemId: string
  activeProduct: ProductInput
  activePricing: PricingConfig
  result: CalculationResult
  isEditing: boolean
  onSelectItem: (id: string) => void
  onAddItem: () => void
  onRemoveItem: (id: string) => void
  onApplyFreightSplit: (valores: Record<string, number>) => void
  onProductChange: (patch: Partial<ProductInput>) => void
  onPricingChange: (patch: Partial<PricingConfig>) => void
  onSave: () => void
  onNew: () => void
  onGoToCotacoes: () => void
}) {
  const travadaPorOutro = activeStatus !== 'PENDENTE' && !!activeResponsavel && activeResponsavel !== currentAdmin

  const totalGeral = useMemo(
    () => items.reduce((sum, item) => sum + calculateItem(item.product, item.pricing).precoVendaTotal, 0),
    [items],
  )

  if (!isEditing) {
    return (
      <div className="card text-center py-16">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Nenhuma cotação aberta</h2>
        <p className="text-sm text-ink-400 mb-5">
          Crie ou abra uma cotação na aba Cotações pra começar a precificar os itens dela.
        </p>
        <Button variant="primary" onClick={onGoToCotacoes}>
          Ir para Cotações
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {travadaPorOutro && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Esta cotação está sendo analisada por <strong>{activeResponsavel}</strong> — só ele(a) pode alterá-la
            agora. Você pode ver os dados, mas não vai conseguir salvar nenhuma mudança.
          </p>
        </div>
      )}

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Dados da cotação</h2>
        <p className="text-sm text-ink-400 mb-4">Informações gerais — servem de base pra recursos futuros.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField label="Vendedor" value={vendedor} onChange={onVendedorChange} options={vendedorOptions} />
          <SelectField
            label="Refere-se a"
            value={tipoReferencia}
            onChange={(v) => onTipoReferenciaChange(v as TipoReferencia)}
            options={tipoReferenciaOptions}
          />
          <TextField label="Cliente" value={cliente} onChange={onClienteChange} uppercase />
          <TextField label="Máquina" value={maquina} onChange={onMaquinaChange} />
        </div>
      </div>

      <QuoteItemsList
        items={items}
        activeItemId={activeItemId}
        onSelect={onSelectItem}
        onAdd={onAddItem}
        onRemove={onRemoveItem}
      />

      <FreightSplitPanel items={items} onApply={onApplyFreightSplit} />

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
              <Button variant="primary" className="flex-1" onClick={onSave} disabled={travadaPorOutro}>
                Atualizar cotação
              </Button>
              <Button variant="secondary" onClick={onNew}>
                Nova cotação
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
