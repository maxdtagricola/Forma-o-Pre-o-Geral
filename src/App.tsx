import { useMemo, useState } from 'react'
import { Layout, type TabKey } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { MarginAnalysisPage } from './pages/MarginAnalysisPage'
import { HistoryPage } from './pages/HistoryPage'
import { calculateItem } from './calc/calculator'
import { saveQuote } from './db/analysesRepo'
import { createQuoteItem } from './types'
import type { PricingConfig, ProductInput, QuoteItem, QuoteRecord } from './types'

export default function App() {
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [items, setItems] = useState<QuoteItem[]>(() => [createQuoteItem()])
  const [activeItemId, setActiveItemId] = useState<string>(() => items[0].id)
  const [editingQuoteId, setEditingQuoteId] = useState<string | undefined>(undefined)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0]
  const result = useMemo(() => calculateItem(activeItem.product, activeItem.pricing), [activeItem])

  function patchActiveProduct(patch: Partial<ProductInput>) {
    setItems((prev) => prev.map((item) => (item.id === activeItemId ? { ...item, product: { ...item.product, ...patch } } : item)))
  }
  function patchActivePricing(patch: Partial<PricingConfig>) {
    setItems((prev) => prev.map((item) => (item.id === activeItemId ? { ...item, pricing: { ...item.pricing, ...patch } } : item)))
  }

  function handleAddItem() {
    const item = createQuoteItem()
    setItems((prev) => [...prev, item])
    setActiveItemId(item.id)
  }

  function handleRemoveItem(id: string) {
    const idx = items.findIndex((item) => item.id === id)
    const next = items.filter((item) => item.id !== id)
    if (next.length === 0) {
      const fresh = createQuoteItem()
      setItems([fresh])
      setActiveItemId(fresh.id)
      return
    }
    setItems(next)
    if (id === activeItemId) {
      setActiveItemId(next[Math.min(idx, next.length - 1)].id)
    }
  }

  async function handleSave() {
    try {
      const record = await saveQuote(items, editingQuoteId)
      setEditingQuoteId(record.id)
      setHistoryRefreshKey((k) => k + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar a cotação no servidor.')
    }
  }

  function handleNew() {
    const fresh = createQuoteItem()
    setItems([fresh])
    setActiveItemId(fresh.id)
    setEditingQuoteId(undefined)
  }

  function handleLoad(record: QuoteRecord) {
    const loadedItems = record.items.length > 0 ? record.items : [createQuoteItem()]
    setItems(loadedItems)
    setActiveItemId(loadedItems[0].id)
    setEditingQuoteId(record.id)
    setTab('dashboard')
  }

  return (
    <Layout active={tab} onChangeTab={setTab}>
      {tab === 'dashboard' && (
        <Dashboard
          items={items}
          activeItemId={activeItem.id}
          activeProduct={activeItem.product}
          activePricing={activeItem.pricing}
          result={result}
          isEditing={!!editingQuoteId}
          onSelectItem={setActiveItemId}
          onAddItem={handleAddItem}
          onRemoveItem={handleRemoveItem}
          onProductChange={patchActiveProduct}
          onPricingChange={patchActivePricing}
          onSave={handleSave}
          onNew={handleNew}
        />
      )}
      {tab === 'margins' && <MarginAnalysisPage product={activeItem.product} pricing={activeItem.pricing} />}
      {tab === 'history' && <HistoryPage refreshKey={historyRefreshKey} onLoad={handleLoad} />}
    </Layout>
  )
}
