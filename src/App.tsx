import { useEffect, useMemo, useState } from 'react'
import { Layout, type TabKey } from './components/Layout'
import { AdminGate } from './components/AdminGate'
import { TelaInicialPage } from './pages/TelaInicialPage'
import { CotacoesPage } from './pages/CotacoesPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { Dashboard } from './pages/Dashboard'
import { CompararFornecedoresPage } from './pages/CompararFornecedoresPage'
import { MarginAnalysisPage } from './pages/MarginAnalysisPage'
import { ProdutosPage } from './pages/ProdutosPage'
import { FornecedoresPage } from './pages/FornecedoresPage'
import { FretePage } from './pages/FretePage'
import { AcompanhamentoNotasPage } from './pages/AcompanhamentoNotasPage'
import { NotasFiscaisPage } from './pages/NotasFiscaisPage'
import { NotasFiscaisDashboardPage } from './pages/NotasFiscaisDashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { PlanilhaClienteModal } from './components/PlanilhaClienteModal'
import { RecuperarRascunhoModal } from './components/RecuperarRascunhoModal'
import { lerRascunho, limparRascunho, salvarRascunho, type RascunhoCotacao } from './rascunhoCotacao'
import { calculateItem, definirTabelasCustomizadas } from './calc/calculator'
import { saveQuote, setPlanilhaOriginal, updateQuoteStatus } from './db/analysesRepo'
import {
  DEFAULT_PRICING_GLOBAL,
  getPlanilhaAtivaIds,
  getPricingGlobal,
  listPlanilhas,
  setPricingGlobal,
  type PricingGlobal,
} from './db/configRepo'
import { listEmpresas } from './db/empresasRepo'
import { clearCurrentAdmin, getCurrentAdmin, setCurrentAdmin } from './currentAdmin'
import { clearCurrentPlayer, getCurrentPlayer, setCurrentPlayer } from './currentPlayer'
import { getModoSessao, limparModoSessao, setModoSessao } from './session'
import { createQuoteItem } from './types'
import type { ItemCotacaoImportado } from './quoteImport'
import type {
  AdminName,
  Empresa,
  EstadoDestino,
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
  // o admin Max começa direto em "Acompanhamento de notas" — é a aba que ele mais usa
  const [tab, setTab] = useState<TabKey>(() => {
    const admin = getModoSessao() === 'admin' ? getCurrentAdmin() : null
    return admin === 'Max' ? 'acompanhamentoNotas' : 'telaInicial'
  })
  const [vendedor, setVendedor] = useState('')
  const [tipoReferencia, setTipoReferencia] = useState<TipoReferencia>('itens')
  const [cliente, setCliente] = useState('')
  const [maquina, setMaquina] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [items, setItems] = useState<QuoteItem[]>(() => [createQuoteItem()])
  const [activeItemId, setActiveItemId] = useState<string>(() => items[0].id)
  const [editingQuoteId, setEditingQuoteId] = useState<string | undefined>(undefined)
  const [codigoCotacao, setCodigoCotacao] = useState('')
  const [activeStatus, setActiveStatus] = useState<QuoteStatus>('PENDENTE')
  const [activeResponsavel, setActiveResponsavel] = useState('')
  const [activeCreatedAt, setActiveCreatedAt] = useState<number | undefined>(undefined)
  const [dataSolicitacao, setDataSolicitacao] = useState<number | undefined>(undefined)
  const [numeroCotacaoTransportadora, setNumeroCotacaoTransportadora] = useState('')
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [pricingGlobal, setPricingGlobalState] = useState<PricingGlobal>(DEFAULT_PRICING_GLOBAL)
  const [tabelasVersion, setTabelasVersion] = useState(0)
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
        empresaId,
        items,
        activeItemId,
        activeStatus,
        activeResponsavel,
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
    empresaId,
    items,
    activeItemId,
    activeStatus,
    activeResponsavel,
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

  // empresas do grupo — usadas no seletor "pra qual empresa é essa cotação" e no frete automático
  useEffect(() => {
    listEmpresas()
      .then(setEmpresas)
      .catch(() => {
        // sem servidor no momento — segue sem a lista, o seletor fica vazio até recarregar
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

  // Memoizado pra não gerar um item novo (com id novo) a cada render — se não, a key
  // do ProductForm ficaria mudando sozinha e ele nunca ficaria "parado" na tela.
  const activeItem = useMemo(
    () => items.find((item) => item.id === activeItemId) ?? items[0] ?? criarItemComGlobais(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, activeItemId],
  )
  const result = useMemo(
    () => calculateItem(activeItem.product, activeItem.pricing),
    [activeItem, tabelasVersion],
  )

  function handleSelectAdmin(admin: AdminName) {
    setModoSessao('admin')
    setCurrentAdmin(admin)
    setCurrentAdminState(admin)
    setTab(admin === 'Max' ? 'acompanhamentoNotas' : 'telaInicial')
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
    setEmpresaId(r.empresaId ?? '')
    setItems(r.items)
    setActiveItemId(r.activeItemId)
    setEditingQuoteId(r.editingQuoteId)
    setCodigoCotacao(r.codigo)
    setActiveStatus(r.activeStatus)
    setActiveResponsavel(r.activeResponsavel)
    setPlanilhaOriginalState(r.planilhaOriginal)
    setTab('dashboard')
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

  async function handleEnviarCotacao() {
    if (!editingQuoteId || !currentAdmin) return
    if (activeStatus === 'PENDENTE' || activeStatus === 'ANALISANDO VALORES') {
      await updateQuoteStatus(editingQuoteId, 'ENVIADO', currentAdmin)
      setActiveStatus('ENVIADO')
      setActiveResponsavel(currentAdmin)
      setHistoryRefreshKey((k) => k + 1)
    }
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
      const record = await saveQuote(
        currentAdmin,
        vendedor,
        tipoReferencia,
        cliente,
        maquina,
        items,
        editingQuoteId,
        empresaId,
        dataSolicitacao,
        numeroCotacaoTransportadora,
      )
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
    setEmpresaId('')
    setItems([fresh])
    setActiveItemId(fresh.id)
    setEditingQuoteId(undefined)
    setCodigoCotacao('')
    setActiveStatus('PENDENTE')
    setActiveResponsavel('')
    setActiveCreatedAt(undefined)
    setDataSolicitacao(undefined)
    setNumeroCotacaoTransportadora('')
    setPlanilhaOriginalState(undefined)
    limparRascunho()
  }

  function handleLoad(record: QuoteRecord) {
    limparRascunho()
    const loadedItems =
      record.items.length > 0
        ? record.items.map((item) => ({ ...item, pricing: { ...item.pricing, ...pricingGlobal } }))
        : [criarItemComGlobais()]
    setVendedor(record.vendedor)
    setTipoReferencia(record.tipoReferencia)
    setCliente(record.cliente)
    setMaquina(record.maquina)
    setEmpresaId(record.empresaId ?? '')
    setItems(loadedItems)
    setActiveItemId(loadedItems[0]?.id ?? '')
    setEditingQuoteId(record.id)
    setCodigoCotacao(record.codigo)
    setActiveStatus(record.status)
    setActiveResponsavel(record.responsavelStatus)
    setActiveCreatedAt(record.createdAt)
    setDataSolicitacao(record.dataSolicitacao)
    setNumeroCotacaoTransportadora(record.numeroCotacaoTransportadora ?? '')
    setPlanilhaOriginalState(record.planilhaOriginal)
    setTab('dashboard')
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
    const itens: QuoteItem[] = itensImportados.map((it) => {
      const item = criarItemComGlobais()
      return {
        ...item,
        product: { ...item.product, referencia: it.referencia, descricao: it.descricao, qtd: it.quantidade || 1 },
      }
    })
    const record = await saveQuote(currentAdmin, vendedorNovo, 'itens', clienteNovo, maquinaNova, itens, undefined)
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
      {tab === 'comparar' && (
        <CompararFornecedoresPage
          currentAdmin={currentAdmin}
          isEditing={!!editingQuoteId}
          activeStatus={activeStatus}
          activeResponsavel={activeResponsavel}
          items={items}
          onPatchItem={patchItemProduct}
          onGoToCotacoes={() => setTab('cotacoes')}
          onGoToPrecificacao={() => setTab('dashboard')}
        />
      )}
      {tab === 'dashboard' && (
        <Dashboard
          currentAdmin={currentAdmin}
          codigo={codigoCotacao}
          activeStatus={activeStatus}
          activeResponsavel={activeResponsavel}
          vendedor={vendedor}
          cliente={cliente}
          maquina={maquina}
          empresaId={empresaId}
          empresas={empresas}
          onVendedorChange={setVendedor}
          onClienteChange={setCliente}
          onMaquinaChange={setMaquina}
          onEmpresaIdChange={setEmpresaId}
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
          onGoToComparar={() => setTab('comparar')}
          onGoToFrete={() => setTab('frete')}
          onEnviarCotacao={handleEnviarCotacao}
          temPlanilhaCliente={!!planilhaOriginal}
          onVerPlanilhaCliente={() => setMostrarPlanilhaCliente(true)}
          createdAt={activeCreatedAt}
          dataSolicitacao={dataSolicitacao}
          onChangeDataSolicitacao={setDataSolicitacao}
          numeroCotacaoTransportadora={numeroCotacaoTransportadora}
          onChangeNumeroCotacaoTransportadora={setNumeroCotacaoTransportadora}
        />
      )}
      {tab === 'margins' && <MarginAnalysisPage product={activeItem.product} pricing={activeItem.pricing} />}
      {tab === 'produtos' && <ProdutosPage currentAdmin={currentAdmin} />}
      {tab === 'fornecedores' && <FornecedoresPage />}
      {tab === 'frete' && <FretePage cotacaoIdInicial={editingQuoteId} />}
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
      {tab === 'notasFiscais' && currentAdmin === 'Max' && <NotasFiscaisPage currentAdmin={currentAdmin} />}
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
