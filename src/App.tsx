import { useEffect, useMemo, useState } from 'react'
import { Layout, type TabKey } from './components/Layout'
import { AdminGate } from './components/AdminGate'
import { CotacoesPage } from './pages/CotacoesPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { Dashboard } from './pages/Dashboard'
import { PreRegistroPage } from './pages/PreRegistroPage'
import { MarginAnalysisPage } from './pages/MarginAnalysisPage'
import { ProdutosPage } from './pages/ProdutosPage'
import { FornecedoresPage } from './pages/FornecedoresPage'
import { HistoryPage } from './pages/HistoryPage'
import { PlanilhaClienteModal } from './components/PlanilhaClienteModal'
import { calculateItem, definirTabelasCustomizadas } from './calc/calculator'
import {
  findByInterno,
  saveQuote,
  setPlanilhaOriginal,
  updateItensPreRegistro,
  updateQuoteStatus,
} from './db/analysesRepo'
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
import { makeId } from './utils'
import type { ItemCotacaoImportado } from './quoteImport'
import type {
  AdminName,
  EstadoDestino,
  PreRegistroItem,
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
  const [preRegistroItems, setPreRegistroItems] = useState<PreRegistroItem[]>([])
  const [planilhaOriginal, setPlanilhaOriginalState] = useState<
    { nomeArquivo: string; conteudoBase64: string } | undefined
  >(undefined)
  const [mostrarPlanilhaCliente, setMostrarPlanilhaCliente] = useState(false)

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

  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0] ?? criarItemComGlobais()
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
  function patchItemProduct(id: string, patch: Partial<ProductInput>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, product: { ...item.product, ...patch } } : item)))
  }
  function handleApplyMarginToAll(lucroPct: number) {
    setItems((prev) => prev.map((item) => ({ ...item, pricing: { ...item.pricing, lucroPct } })))
  }

  function handleAddPreRegistroItem() {
    setPreRegistroItems((prev) => [...prev, { id: makeId(), interno: '', referencia: '', descricao: '', quantidade: 1 }])
  }
  function handleRemovePreRegistroItem(id: string) {
    setPreRegistroItems((prev) => prev.filter((item) => item.id !== id))
  }
  function handlePatchPreRegistroItem(id: string, patch: Partial<PreRegistroItem>) {
    setPreRegistroItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function handleSalvarPreRegistro() {
    if (!editingQuoteId || !currentAdmin) return
    await updateItensPreRegistro(editingQuoteId, preRegistroItems, currentAdmin)
    setHistoryRefreshKey((k) => k + 1)
  }

  async function handleGoToPrecificacao() {
    if (!editingQuoteId || !currentAdmin) return
    await updateItensPreRegistro(editingQuoteId, preRegistroItems, currentAdmin)

    let novosItems = items
    if (items.length === 0) {
      if (preRegistroItems.length > 0) {
        novosItems = await Promise.all(
          preRegistroItems.map(async (pre) => {
            const item = criarItemComGlobais()
            const encontrado = await findByInterno(pre.interno)
            return {
              ...item,
              product: {
                ...item.product,
                ...(encontrado ?? {}),
                interno: pre.interno,
                referencia: pre.referencia || encontrado?.referencia || '',
                descricao: pre.descricao || encontrado?.descricao || '',
                qtd: pre.quantidade || 1,
              },
            }
          }),
        )
      } else {
        novosItems = [criarItemComGlobais()]
      }
      setItems(novosItems)
      setActiveItemId(novosItems[0].id)
      await saveQuote(currentAdmin, vendedor, tipoReferencia, cliente, maquina, novosItems, editingQuoteId)
      setHistoryRefreshKey((k) => k + 1)
    }

    if (activeStatus === 'PENDENTE') {
      await updateQuoteStatus(editingQuoteId, 'ANALISANDO VALORES', currentAdmin)
      setActiveStatus('ANALISANDO VALORES')
      setActiveResponsavel(currentAdmin)
      setHistoryRefreshKey((k) => k + 1)
    }
    setTab('dashboard')
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
    setPreRegistroItems([])
    setPlanilhaOriginalState(undefined)
  }

  function handleLoad(record: QuoteRecord) {
    const loadedItems = record.items.map((item) => ({ ...item, pricing: { ...item.pricing, ...pricingGlobal } }))
    setVendedor(record.vendedor)
    setTipoReferencia(record.tipoReferencia)
    setCliente(record.cliente)
    setMaquina(record.maquina)
    setItems(loadedItems)
    setActiveItemId(loadedItems[0]?.id ?? '')
    setEditingQuoteId(record.id)
    setActiveStatus(record.status)
    setActiveResponsavel(record.responsavelStatus)
    setPreRegistroItems(record.itensPreRegistro ?? [])
    setPlanilhaOriginalState(record.planilhaOriginal)
    setTab('preregistro')
  }

  async function handleCreateQuote(vendedorNovo: string, clienteNovo: string, maquinaNova: string, tipo: TipoReferencia) {
    if (!currentAdmin) return
    try {
      const record = await saveQuote(currentAdmin, vendedorNovo, tipo, clienteNovo, maquinaNova, [], undefined)
      setHistoryRefreshKey((k) => k + 1)
      handleLoad(record)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar a cotação no servidor.')
    }
  }

  async function handleImportQuote(
    vendedorNovo: string,
    clienteNovo: string,
    maquinaNova: string,
    itensImportados: ItemCotacaoImportado[],
    planilha: { nomeArquivo: string; conteudoBase64: string },
  ) {
    if (!currentAdmin) return
    const record = await saveQuote(currentAdmin, vendedorNovo, 'itens', clienteNovo, maquinaNova, [], undefined)
    const itens: PreRegistroItem[] = itensImportados.map((it) => ({
      id: makeId(),
      interno: '',
      referencia: it.referencia,
      descricao: it.descricao,
      quantidade: it.quantidade,
    }))
    await updateItensPreRegistro(record.id, itens, currentAdmin)
    const registroFinal = await setPlanilhaOriginal(record.id, planilha)
    setHistoryRefreshKey((k) => k + 1)
    handleLoad(registroFinal)
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
          onImportQuote={handleImportQuote}
          onOpenQuote={handleLoad}
        />
      )}
      {tab === 'analytics' && <AnalyticsPage />}
      {tab === 'preregistro' && (
        <PreRegistroPage
          currentAdmin={currentAdmin}
          isEditing={!!editingQuoteId}
          activeStatus={activeStatus}
          activeResponsavel={activeResponsavel}
          itens={preRegistroItems}
          onAddItem={handleAddPreRegistroItem}
          onRemoveItem={handleRemovePreRegistroItem}
          onPatchItem={handlePatchPreRegistroItem}
          onSalvar={handleSalvarPreRegistro}
          onIrParaPrecificacao={handleGoToPrecificacao}
          onGoToCotacoes={() => setTab('cotacoes')}
        />
      )}
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
          onPatchItem={patchItemProduct}
          onApplyMarginToAll={handleApplyMarginToAll}
          onProductChange={patchActiveProduct}
          onPricingChange={patchActivePricing}
          onSave={handleSave}
          onNew={handleNew}
          onGoToCotacoes={() => setTab('cotacoes')}
          onGoToPreRegistro={() => setTab('preregistro')}
          temPlanilhaCliente={!!planilhaOriginal}
          onVerPlanilhaCliente={() => setMostrarPlanilhaCliente(true)}
        />
      )}
      {tab === 'margins' && <MarginAnalysisPage product={activeItem.product} pricing={activeItem.pricing} />}
      {tab === 'produtos' && <ProdutosPage currentAdmin={currentAdmin} />}
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

      {mostrarPlanilhaCliente && planilhaOriginal && (
        <PlanilhaClienteModal
          nomeArquivo={planilhaOriginal.nomeArquivo}
          conteudoBase64={planilhaOriginal.conteudoBase64}
          items={items}
          cliente={cliente}
          maquina={maquina}
          onClose={() => setMostrarPlanilhaCliente(false)}
        />
      )}
    </Layout>
  )
}
