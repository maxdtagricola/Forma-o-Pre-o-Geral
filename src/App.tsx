import { useEffect, useMemo, useState } from 'react'
import { Layout, type TabKey } from './components/Layout'
import { AdminGate } from './components/AdminGate'
import { TelaInicialPage } from './pages/TelaInicialPage'
import { CotacoesPage } from './pages/CotacoesPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { Dashboard } from './pages/Dashboard'
import { PreRegistroPage } from './pages/PreRegistroPage'
import { CompararFornecedoresPage } from './pages/CompararFornecedoresPage'
import { MarginAnalysisPage } from './pages/MarginAnalysisPage'
import { ProdutosPage } from './pages/ProdutosPage'
import { FornecedoresPage } from './pages/FornecedoresPage'
import { FretePage } from './pages/FretePage'
import { AcompanhamentoNotasPage } from './pages/AcompanhamentoNotasPage'
import { NotasFiscaisDashboardPage } from './pages/NotasFiscaisDashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { PlanilhaClienteModal } from './components/PlanilhaClienteModal'
import { RecuperarRascunhoModal } from './components/RecuperarRascunhoModal'
import { lerRascunho, limparRascunho, salvarRascunho, type RascunhoCotacao } from './rascunhoCotacao'
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
import { clearCurrentPlayer, getCurrentPlayer, setCurrentPlayer } from './currentPlayer'
import { getModoSessao, limparModoSessao, setModoSessao } from './session'
import { createQuoteItem } from './types'
import { makeId, melhorCotacaoFornecedor } from './utils'
import type { ItemCotacaoImportado } from './quoteImport'
import type {
  AdminName,
  CotacaoFornecedorItem,
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
  const [currentAdmin, setCurrentAdminState] = useState<AdminName | null>(() =>
    getModoSessao() === 'admin' ? getCurrentAdmin() : null,
  )
  const [currentPlayer, setCurrentPlayerState] = useState<string | null>(() =>
    getModoSessao() === 'jogador' ? getCurrentPlayer() : null,
  )
  const [tab, setTab] = useState<TabKey>('telaInicial')
  const [vendedor, setVendedor] = useState('')
  const [tipoReferencia, setTipoReferencia] = useState<TipoReferencia>('itens')
  const [cliente, setCliente] = useState('')
  const [maquina, setMaquina] = useState('')
  const [items, setItems] = useState<QuoteItem[]>(() => [createQuoteItem()])
  const [activeItemId, setActiveItemId] = useState<string>(() => items[0].id)
  const [editingQuoteId, setEditingQuoteId] = useState<string | undefined>(undefined)
  const [codigoCotacao, setCodigoCotacao] = useState('')
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
  const [rascunhoDisponivel, setRascunhoDisponivel] = useState<RascunhoCotacao | undefined>(undefined)

  // ao abrir o app, verifica se sobrou algum rascunho de uma queda/fechamento anterior
  useEffect(() => {
    const rascunho = lerRascunho()
    if (rascunho) setRascunhoDisponivel(rascunho)
  }, [])

  // salva o estado da cotação aberta a cada mudança (com um pequeno atraso), pra não perder
  // nada se a página fechar/travar antes do próximo "Salvar" manual
  useEffect(() => {
    if (!editingQuoteId) return
    const timer = setTimeout(() => {
      salvarRascunho({
        editingQuoteId,
        codigo: codigoCotacao,
        vendedor,
        tipoReferencia,
        cliente,
        maquina,
        items,
        activeItemId,
        activeStatus,
        activeResponsavel,
        preRegistroItems,
        planilhaOriginal,
      })
    }, 1500)
    return () => clearTimeout(timer)
  }, [
    editingQuoteId,
    codigoCotacao,
    vendedor,
    tipoReferencia,
    cliente,
    maquina,
    items,
    activeItemId,
    activeStatus,
    activeResponsavel,
    preRegistroItems,
    planilhaOriginal,
  ])

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
    setModoSessao('admin')
    setCurrentAdmin(admin)
    setCurrentAdminState(admin)
  }

  function handleSwitchAdmin() {
    clearCurrentAdmin()
    limparModoSessao()
    setCurrentAdminState(null)
  }

  function handleSelectPlayer(nome: string) {
    setModoSessao('jogador')
    setCurrentPlayer(nome)
    setCurrentPlayerState(nome)
  }

  function handleSairJogador() {
    clearCurrentPlayer()
    limparModoSessao()
    setCurrentPlayerState(null)
  }

  function handleRecuperarRascunho() {
    if (!rascunhoDisponivel) return
    const r = rascunhoDisponivel
    setVendedor(r.vendedor)
    setTipoReferencia(r.tipoReferencia)
    setCliente(r.cliente)
    setMaquina(r.maquina)
    setItems(r.items)
    setActiveItemId(r.activeItemId)
    setEditingQuoteId(r.editingQuoteId)
    setCodigoCotacao(r.codigo)
    setActiveStatus(r.activeStatus)
    setActiveResponsavel(r.activeResponsavel)
    setPreRegistroItems(r.preRegistroItems)
    setPlanilhaOriginalState(r.planilhaOriginal)
    setTab('preregistro')
    setRascunhoDisponivel(undefined)
  }

  function handleDescartarRascunho() {
    limparRascunho()
    setRascunhoDisponivel(undefined)
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
    setPreRegistroItems((prev) => [
      ...prev,
      { id: makeId(), interno: '', referencia: '', descricao: '', quantidade: 1, cotacoesFornecedores: [] },
    ])
  }
  function handleRemovePreRegistroItem(id: string) {
    setPreRegistroItems((prev) => prev.filter((item) => item.id !== id))
  }
  function handlePatchPreRegistroItem(id: string, patch: Partial<PreRegistroItem>) {
    setPreRegistroItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function handleAddCotacaoFornecedor(itemId: string, cotacao: Omit<CotacaoFornecedorItem, 'id'>) {
    setPreRegistroItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, cotacoesFornecedores: [...(item.cotacoesFornecedores ?? []), { ...cotacao, id: makeId() }] }
          : item,
      ),
    )
  }
  function handleRemoveCotacaoFornecedor(itemId: string, cotacaoId: string) {
    setPreRegistroItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, cotacoesFornecedores: (item.cotacoesFornecedores ?? []).filter((c) => c.id !== cotacaoId) }
          : item,
      ),
    )
  }

  async function handleSalvarPreRegistro() {
    if (!editingQuoteId || !currentAdmin) return
    await updateItensPreRegistro(editingQuoteId, preRegistroItems, currentAdmin)
    setHistoryRefreshKey((k) => k + 1)
    limparRascunho()
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
            const melhorCotacao = melhorCotacaoFornecedor(pre.cotacoesFornecedores)
            return {
              ...item,
              product: {
                ...item.product,
                ...(encontrado ?? {}),
                interno: pre.interno,
                referencia: pre.referencia || encontrado?.referencia || '',
                descricao: pre.descricao || encontrado?.descricao || '',
                qtd: pre.quantidade || 1,
                ...(melhorCotacao
                  ? {
                      valorUnt: melhorCotacao.valorUnitario,
                      fornecedor: melhorCotacao.fornecedor,
                      marca: melhorCotacao.marca,
                    }
                  : {}),
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
    limparRascunho()
  }

  async function handleEncaminharFornecedores() {
    if (!editingQuoteId || !currentAdmin) return
    if (activeStatus !== 'PENDENTE') return
    await updateQuoteStatus(editingQuoteId, 'AGUARDANDO FORNECEDOR', currentAdmin)
    setActiveStatus('AGUARDANDO FORNECEDOR')
    setActiveResponsavel(currentAdmin)
    setHistoryRefreshKey((k) => k + 1)
    limparRascunho()
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
      limparRascunho()
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
    setCodigoCotacao('')
    setActiveStatus('PENDENTE')
    setActiveResponsavel('')
    setPreRegistroItems([])
    setPlanilhaOriginalState(undefined)
    limparRascunho()
  }

  function handleLoad(record: QuoteRecord) {
    limparRascunho()
    const loadedItems = record.items.map((item) => ({ ...item, pricing: { ...item.pricing, ...pricingGlobal } }))
    setVendedor(record.vendedor)
    setTipoReferencia(record.tipoReferencia)
    setCliente(record.cliente)
    setMaquina(record.maquina)
    setItems(loadedItems)
    setActiveItemId(loadedItems[0]?.id ?? '')
    setEditingQuoteId(record.id)
    setCodigoCotacao(record.codigo)
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

  if (currentPlayer) {
    return (
      <div className="min-h-screen bg-ink-50">
        <header className="flex items-center justify-between gap-3 border-b border-ink-100 bg-surface px-4 py-3">
          <p className="text-sm font-medium text-ink-700">
            Olá, <span className="font-semibold">{currentPlayer}</span>
          </p>
          <button type="button" onClick={handleSairJogador} className="text-xs text-ink-400 hover:text-ink-600 underline">
            Sair
          </button>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-6">
          <TelaInicialPage jogador={currentPlayer} />
        </main>
      </div>
    )
  }

  if (!currentAdmin) {
    return <AdminGate onSelect={handleSelectAdmin} onSelectPlayer={handleSelectPlayer} />
  }

  return (
    <Layout active={tab} onChangeTab={setTab} currentAdmin={currentAdmin} onSwitchAdmin={handleSwitchAdmin}>
      {tab === 'telaInicial' && <TelaInicialPage jogador={currentAdmin} />}
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
          codigo={codigoCotacao}
          activeStatus={activeStatus}
          activeResponsavel={activeResponsavel}
          cliente={cliente}
          maquina={maquina}
          itens={preRegistroItems}
          onAddItem={handleAddPreRegistroItem}
          onRemoveItem={handleRemovePreRegistroItem}
          onPatchItem={handlePatchPreRegistroItem}
          onSalvar={handleSalvarPreRegistro}
          onIrParaPrecificacao={handleGoToPrecificacao}
          onEncaminharFornecedores={handleEncaminharFornecedores}
          onGoToCotacoes={() => setTab('cotacoes')}
          onGoToComparar={() => setTab('comparar')}
        />
      )}
      {tab === 'comparar' && (
        <CompararFornecedoresPage
          currentAdmin={currentAdmin}
          isEditing={!!editingQuoteId}
          activeStatus={activeStatus}
          activeResponsavel={activeResponsavel}
          itens={preRegistroItems}
          onAddCotacao={handleAddCotacaoFornecedor}
          onRemoveCotacao={handleRemoveCotacaoFornecedor}
          onSalvar={handleSalvarPreRegistro}
          onGoToCotacoes={() => setTab('cotacoes')}
          onGoToPreRegistro={() => setTab('preregistro')}
        />
      )}
      {tab === 'dashboard' && (
        <Dashboard
          currentAdmin={currentAdmin}
          codigo={codigoCotacao}
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
          onGoToComparar={() => setTab('comparar')}
          temPlanilhaCliente={!!planilhaOriginal}
          onVerPlanilhaCliente={() => setMostrarPlanilhaCliente(true)}
        />
      )}
      {tab === 'margins' && <MarginAnalysisPage product={activeItem.product} pricing={activeItem.pricing} />}
      {tab === 'produtos' && <ProdutosPage currentAdmin={currentAdmin} />}
      {tab === 'fornecedores' && <FornecedoresPage />}
      {tab === 'frete' && <FretePage />}
      {tab === 'configuracoes' && (
        <ConfiguracoesPage
          currentAdmin={currentAdmin}
          pricingGlobal={pricingGlobal}
          onSavePricingGlobal={handleSavePricingGlobal}
        />
      )}
      {tab === 'acompanhamentoNotas' && currentAdmin === 'Max' && (
        <AcompanhamentoNotasPage currentAdmin={currentAdmin} />
      )}
      {tab === 'notasFiscaisDashboard' && currentAdmin === 'Max' && <NotasFiscaisDashboardPage />}
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

      {rascunhoDisponivel && (
        <RecuperarRascunhoModal
          rascunho={rascunhoDisponivel}
          onRecuperar={handleRecuperarRascunho}
          onDescartar={handleDescartarRascunho}
        />
      )}
    </Layout>
  )
}
