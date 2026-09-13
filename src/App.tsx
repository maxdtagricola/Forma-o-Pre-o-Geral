import { useEffect, useMemo, useState } from 'react'
import { Layout, type TabKey } from './components/Layout'
import { AdminGate } from './components/AdminGate'
import { CotacoesPage } from './pages/CotacoesPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { Dashboard } from './pages/Dashboard'
import { MarginAnalysisPage } from './pages/MarginAnalysisPage'
import { ProdutosPage } from './pages/ProdutosPage'
import { FornecedoresPage } from './pages/FornecedoresPage'
import { HistoryPage } from './pages/HistoryPage'
import { calculateItem, definirTabelasCustomizadas } from './calc/calculator'
import { saveQuote } from './db/analysesRepo'
import {
  DEFAULT_PRICING_GLOBAL,
  getPlanilhaAtivaIds,
  getPricingGlobal,
  listPlanilhas,
  setPricingGlobal,
  type PricingGlobal,
} from './db/configRepo'
import { clearCurrentAdmin, getCurrentAdmin, setCurrentAdmin } from './currentAdmin'
import { createQuoteItem } from './types'
import type {
  AdminName,
  EstadoDestino,
  PricingConfig,
  ProductInput,
  QuoteItem,
  QuoteRecord,
  QuoteStatus,
  TipoReferencia,
} from './types'

export default function App() {
  const [currentAdmin, setCurrentAdminState] = useState<AdminName | null>(() => getCurrentAdmin())
  const [tab, setTab] = useState<TabKey>('cotacoes')
  const [vendedor, setVendedor] = useState('')
  const [tipoReferencia, setTipoReferencia] = useState<TipoReferencia>('itens')
  const [cliente, setCliente] = useState('')
  const [maquina, setMaquina] = useState('')
  const [items, setItems] = useState<QuoteItem[]>(() => [createQuoteItem()])
  const [activeItemId, setActiveItemId] = useState<string>(() => items[0].id)
  const [editingQuoteId, setEditingQuoteId] = useState<string | undefined>(undefined)
  const [activeStatus, setActiveStatus] = useState<QuoteStatus>('PENDENTE')
  const [activeResponsavel, setActiveResponsavel] = useState('')
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [pricingGlobal, setPricingGlobalState] = useState<PricingGlobal>(DEFAULT_PRICING_GLOBAL)
  const [tabelasVersion, setTabelasVersion] = useState(0)

  // formação de preço global — carrega do servidor e mantém os itens sincronizados
  useEffect(() => {
    getPricingGlobal()
      .then(setPricingGlobalState)
      .catch(() => {
        // se falhar, segue com os valores padrão
      })
  }, [])

  useEffect(() => {
    setItems((prev) => prev.map((item) => ({ ...item, pricing: { ...item.pricing, ...pricingGlobal } })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingGlobal])

  // planilhas de markup customizadas (se alguma tiver sido importada e salva antes)
  useEffect(() => {
    async function carregarTabelasCustomizadas() {
      try {
        const [ativas, todas] = await Promise.all([getPlanilhaAtivaIds(), listPlanilhas()])
        let mudou = false
        for (const perfil of Object.keys(ativas) as EstadoDestino[]) {
          const id = ativas[perfil]
          const planilha = todas.find((p) => p.id === id)
          if (planilha) {
            definirTabelasCustomizadas(perfil, planilha.rbc, planilha.icmsSt)
            mudou = true
          }
        }
        if (mudou) setTabelasVersion((v) => v + 1)
      } catch {
        // tabelas customizadas são opcionais — sem elas, seguem as tabelas padrão
      }
    }
    carregarTabelasCustomizadas()
  }, [])

  function criarItemComGlobais(): QuoteItem {
    const item = createQuoteItem()
    return { ...item, pricing: { ...item.pricing, ...pricingGlobal } }
  }

  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0]
  const result = useMemo(
    () => calculateItem(activeItem.product, activeItem.pricing),
    [activeItem, tabelasVersion],
  )

  function handleSelectAdmin(admin: AdminName) {
    setCurrentAdmin(admin)
    setCurrentAdminState(admin)
  }

  function handleSwitchAdmin() {
    clearCurrentAdmin()
    setCurrentAdminState(null)
  }

  async function handleSavePricingGlobal(valores: PricingGlobal) {
    await setPricingGlobal(valores)
    setPricingGlobalState(valores)
  }

  function patchActiveProduct(patch: Partial<ProductInput>) {
    setItems((prev) => prev.map((item) => (item.id === activeItemId ? { ...item, product: { ...item.product, ...patch } } : item)))
  }
  function patchActivePricing(patch: Partial<PricingConfig>) {
    setItems((prev) => prev.map((item) => (item.id === activeItemId ? { ...item, pricing: { ...item.pricing, ...patch } } : item)))
  }

  function handleAddItem() {
    const item = criarItemComGlobais()
    setItems((prev) => [...prev, item])
    setActiveItemId(item.id)
  }

  function handleApplyFreightSplit(valores: Record<string, number>) {
    setItems((prev) =>
      prev.map((item) =>
        item.id in valores ? { ...item, product: { ...item.product, freteAdicional: valores[item.id] } } : item,
      ),
    )
  }

  function handleRemoveItem(id: string) {
    const idx = items.findIndex((item) => item.id === id)
    const next = items.filter((item) => item.id !== id)
    if (next.length === 0) {
      const fresh = criarItemComGlobais()
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
    if (!currentAdmin) return
    try {
      const record = await saveQuote(currentAdmin, vendedor, tipoReferencia, cliente, maquina, items, editingQuoteId)
      setEditingQuoteId(record.id)
      setHistoryRefreshKey((k) => k + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar a cotação no servidor.')
    }
  }

  function handleNew() {
    const fresh = criarItemComGlobais()
    setVendedor('')
    setTipoReferencia('itens')
    setCliente('')
    setMaquina('')
    setItems([fresh])
    setActiveItemId(fresh.id)
    setEditingQuoteId(undefined)
    setActiveStatus('PENDENTE')
    setActiveResponsavel('')
  }

  function handleLoad(record: QuoteRecord) {
    const baseItems = record.items.length > 0 ? record.items : [createQuoteItem()]
    const loadedItems = baseItems.map((item) => ({ ...item, pricing: { ...item.pricing, ...pricingGlobal } }))
    setVendedor(record.vendedor)
    setTipoReferencia(record.tipoReferencia)
    setCliente(record.cliente)
    setMaquina(record.maquina)
    setItems(loadedItems)
    setActiveItemId(loadedItems[0].id)
    setEditingQuoteId(record.id)
    setActiveStatus(record.status)
    setActiveResponsavel(record.responsavelStatus)
    setTab('dashboard')
  }

  async function handleCreateQuote(vendedorNovo: string, clienteNovo: string, tipo: TipoReferencia) {
    if (!currentAdmin) return
    try {
      const item = criarItemComGlobais()
      const record = await saveQuote(currentAdmin, vendedorNovo, tipo, clienteNovo, '', [item], undefined)
      setHistoryRefreshKey((k) => k + 1)
      handleLoad(record)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar a cotação no servidor.')
    }
  }

  if (!currentAdmin) {
    return <AdminGate onSelect={handleSelectAdmin} />
  }

  return (
    <Layout active={tab} onChangeTab={setTab} currentAdmin={currentAdmin} onSwitchAdmin={handleSwitchAdmin}>
      {tab === 'cotacoes' && (
        <CotacoesPage
          refreshKey={historyRefreshKey}
          currentAdmin={currentAdmin}
          onCreateQuote={handleCreateQuote}
          onOpenQuote={handleLoad}
        />
      )}
      {tab === 'analytics' && <AnalyticsPage />}
      {tab === 'dashboard' && (
        <Dashboard
          currentAdmin={currentAdmin}
          activeStatus={activeStatus}
          activeResponsavel={activeResponsavel}
          vendedor={vendedor}
          tipoReferencia={tipoReferencia}
          cliente={cliente}
          maquina={maquina}
          onVendedorChange={setVendedor}
          onTipoReferenciaChange={setTipoReferencia}
          onClienteChange={setCliente}
          onMaquinaChange={setMaquina}
          items={items}
          activeItemId={activeItem.id}
          activeProduct={activeItem.product}
          activePricing={activeItem.pricing}
          result={result}
          isEditing={!!editingQuoteId}
          onSelectItem={setActiveItemId}
          onAddItem={handleAddItem}
          onRemoveItem={handleRemoveItem}
          onApplyFreightSplit={handleApplyFreightSplit}
          onProductChange={patchActiveProduct}
          onPricingChange={patchActivePricing}
          onSave={handleSave}
          onNew={handleNew}
          onGoToCotacoes={() => setTab('cotacoes')}
        />
      )}
      {tab === 'margins' && <MarginAnalysisPage product={activeItem.product} pricing={activeItem.pricing} />}
      {tab === 'produtos' && <ProdutosPage />}
      {tab === 'fornecedores' && <FornecedoresPage />}
      {tab === 'configuracoes' && (
        <ConfiguracoesPage
          currentAdmin={currentAdmin}
          pricingGlobal={pricingGlobal}
          onSavePricingGlobal={handleSavePricingGlobal}
        />
      )}
      {tab === 'history' && (
        <HistoryPage refreshKey={historyRefreshKey} currentAdmin={currentAdmin} onLoad={handleLoad} />
      )}
    </Layout>
  )
}
