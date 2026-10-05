import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Basics'
import { SelectField } from '../components/ui/Field'
import { PedidoCompraModal } from '../components/PedidoCompraModal'
import { PedidoCompraFornecedorModal, type BasePedidoCompraFornecedor } from '../components/PedidoCompraFornecedorModal'
import {
  CartaoTransporte,
  SeloPrevisao,
  TRANSPORTE_VAZIO,
  TransporteModal,
  normalizarLinkRastreio,
  previsaoDaCotacao,
  type DadosTransporteEditaveis,
} from '../components/TransporteFornecedor'
import {
  chaveFornecedorFrete,
  freteDoFornecedor,
  listQuotes,
  rotuloRemetente,
  salvarItensFechados,
  salvarTransporte,
  updateQuoteStatus,
  type RemetenteFrete,
} from '../db/analysesRepo'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { formatCurrency } from '../utils'
import { calculateItem } from '../calc/calculator'
import { formatarNumeroBR, parseNumeroFlexivel } from '../numeros'
import { avisar, pedirMotivoArquivamento } from '../dialogs'
import { QUOTE_STATUSES } from '../types'
import type { DadosFreteTransportadora, DadosTransporte, ItemFechado, PedidoCompraInfo, QuoteItem, QuoteRecord, QuoteStatus } from '../types'

// a partir de EM TRANSPORTE (no fluxo de QUOTE_STATUSES), cada fornecedor mostra o cartão Transporte
const INDICE_EM_TRANSPORTE = QUOTE_STATUSES.indexOf('EM TRANSPORTE')

/** Frete digitado em R$ (por unidade, ou o total do fornecedor) ou em % do valor dos produtos —
 * guardado do mesmo jeito (freteRate, fração do valor) nos dois casos. Preferência deste aparelho. */
type ModoFrete = 'valor' | 'percentual'
const CHAVE_MODO_FRETE = 'pedidoCompra.modoFrete'

function lerModoFrete(): ModoFrete {
  try {
    return localStorage.getItem(CHAVE_MODO_FRETE) === 'percentual' ? 'percentual' : 'valor'
  } catch {
    return 'valor'
  }
}

/** "5,25%" — fração (0.0525) em porcentagem com vírgula. */
function percentual(taxa: number): string {
  return `${formatarNumeroBR((taxa || 0) * 100, 2)}%`
}

/** A cotação de frete mais barata desse fornecedor/UF (aba Frete / Itens da cotação): transportadora e dados. */
function freteMaisBarato(cotacao: QuoteRecord, remetente: RemetenteFrete): [string, DadosFreteTransportadora] | undefined {
  let melhor: [string, DadosFreteTransportadora] | undefined
  let menor = Number.POSITIVE_INFINITY
  for (const [transportadora, frete] of Object.entries(freteDoFornecedor(cotacao, remetente))) {
    const valor = parseNumeroFlexivel(frete.valorCotacao)
    if (valor !== undefined && valor > 0 && valor < menor) {
      menor = valor
      melhor = [transportadora, frete]
    }
  }
  return melhor
}

/** Chave dos dados de transporte de um grupo (a do frete; itens sem fornecedor ficam juntos). */
function chaveTransporte(chaveGrupo: string): string {
  return chaveGrupo || 'SEM FORNECEDOR'
}

/** Campos de transporte de um fornecedor: o que já foi salvo, ou a transportadora e o nº da cotação
 * do frete mais barato dele (aba Frete) como ponto de partida. */
function transporteInicial(cotacao: QuoteRecord, chaveGrupo: string, remetente: RemetenteFrete): DadosTransporteEditaveis {
  const salvo = cotacao.transportePorFornecedor?.[chaveTransporte(chaveGrupo)]
  if (salvo) {
    const { atualizadoEm: _em, atualizadoPor: _por, ...campos } = salvo
    return { ...TRANSPORTE_VAZIO, ...campos }
  }
  const frete = remetente.nome ? freteMaisBarato(cotacao, remetente) : undefined
  return {
    ...TRANSPORTE_VAZIO,
    transportadora: frete?.[0] ?? '',
    numeroCotacaoFrete: frete?.[1].numeroCotacao?.trim() || cotacao.numeroCotacaoTransportadora || '',
  }
}

/** "Aplicar a todos os itens" do fornecedor: o frete total dele em R$ (dividido pelo valor dos
 * produtos) ou uma % do valor — os dois viram a mesma taxa em todos os itens do grupo. */
function AplicarFreteGrupo({
  modo,
  valorProdutos,
  onAplicar,
}: {
  modo: ModoFrete
  valorProdutos: number
  onAplicar: (taxa: number) => void
}) {
  const [texto, setTexto] = useState('')
  function aplicar() {
    const valor = parseNumeroFlexivel(texto)
    if (valor === undefined || valor < 0) {
      void avisar(modo === 'valor' ? 'Digite o valor total do frete desse fornecedor (ex.: 350,00).' : 'Digite a porcentagem do frete (ex.: 5,5).')
      return
    }
    if (modo === 'valor' && valorProdutos <= 0) {
      void avisar('Os itens desse fornecedor ainda estão sem valor — preencha o valor fechado antes de aplicar um frete em R$.')
      return
    }
    onAplicar(modo === 'valor' ? valor / valorProdutos : valor / 100)
    setTexto('')
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-600">Frete desse fornecedor, pra todos os itens:</span>
      <input
        className="field-input w-36 py-1 text-right tabular-nums"
        inputMode="decimal"
        aria-label={modo === 'valor' ? 'Frete total do fornecedor em reais' : 'Frete do fornecedor em porcentagem'}
        placeholder={modo === 'valor' ? 'R$ total' : '% do valor'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && aplicar()}
      />
      <span className="text-xs text-ink-400">{modo === 'valor' ? 'R$ (total do fornecedor)' : '% do valor dos produtos'}</span>
      <Button variant="secondary" onClick={aplicar} disabled={!texto.trim()}>
        Aplicar
      </Button>
    </div>
  )
}

function estatisticasGrupo(items: QuoteItem[], fechados: Record<string, ItemFechado>) {
  let qtdNegociada = 0
  let valorNegociado = 0
  let freteNegociado = 0
  let qtdFechada = 0
  let valorFechado = 0
  let freteFechado = 0
  for (const item of items) {
    const totalNegociado = (item.product.qtd || 0) * (item.product.valorUnt || 0)
    qtdNegociada += item.product.qtd || 0
    valorNegociado += totalNegociado
    freteNegociado += totalNegociado * (item.product.freteRate || 0)

    const f = fechados[item.id] ?? { qtd: item.product.qtd, valorUnt: item.product.valorUnt, freteRate: item.product.freteRate }
    const totalFechado = (f.qtd || 0) * (f.valorUnt || 0)
    qtdFechada += f.qtd || 0
    valorFechado += totalFechado
    freteFechado += totalFechado * (f.freteRate || 0)
  }
  return {
    valorNegociado,
    valorFechado,
    freteNegociado,
    freteFechado,
    freteUnitNegociado: qtdNegociada > 0 ? freteNegociado / qtdNegociada : 0,
    freteUnitFechado: qtdFechada > 0 ? freteFechado / qtdFechada : 0,
  }
}

/** Preço de venda unitário passado ao cliente na cotação (a mesma conta da precificação). */
function precoDeVenda(item: QuoteItem): number {
  return calculateItem(item.product, item.pricing).precoVendaUnitario
}

function valorDeVenda(items: QuoteItem[]): number {
  return items.reduce((s, item) => s + precoDeVenda(item) * (item.product.qtd || 0), 0)
}

/** Valor de venda (não tem negociado × fechado — é o que foi passado ao cliente). */
function StatVenda({ label, valor, detalhe }: { label: string; valor: number; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <p className="text-xs text-ink-400 mb-1">{label}</p>
      <p className="font-mono text-base font-semibold tabular-nums text-ink-900">{formatCurrency(valor)}</p>
      {detalhe && <p className="text-xs text-ink-500">{detalhe}</p>}
    </div>
  )
}

function MiniStat({ label, negociado, fechado }: { label: string; negociado: number; fechado: number }) {
  const dif = fechado - negociado
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-3">
      <p className="text-xs text-ink-400 mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm text-ink-500 line-through decoration-ink-300">{formatCurrency(negociado)}</span>
        <span className="font-mono text-base font-semibold text-ink-900">{formatCurrency(fechado)}</span>
      </div>
      {Math.abs(dif) > 0.001 && (
        <p className={`text-xs font-medium ${dif < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {dif < 0 ? '' : '+'}
          {formatCurrency(dif)}
        </p>
      )}
    </div>
  )
}

/** Compara, item a item e por fornecedor, o que foi negociado na cotação (item.product) com o que
 * realmente saiu no fechamento do pedido — os dois ficam separados de propósito: a negociação
 * inicial (feita na correria) e o fechamento final costumam divergir, e é nessa diferença que dá
 * pra enxergar o que se ganhou em cima do produto. É a MESMA cotação (mesmo registro/id) — só o
 * status é compartilhado entre essa aba e a Cotação; os valores de item ficam cada um no seu canto. */
export function PedidoCompraPage({ currentAdmin }: { currentAdmin: string }) {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [cotacaoId, setCotacaoId] = useState('')
  const [fechados, setFechados] = useState<Record<string, ItemFechado>>({})
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [pedidoModalAberto, setPedidoModalAberto] = useState(false)
  const [transporteModalAberto, setTransporteModalAberto] = useState(false)
  const [pedidoFornecedorAberto, setPedidoFornecedorAberto] = useState<string | undefined>(undefined)
  const [modoFrete, setModoFrete] = useState<ModoFrete>(lerModoFrete)

  function mudarModoFrete(modo: ModoFrete) {
    setModoFrete(modo)
    try {
      localStorage.setItem(CHAVE_MODO_FRETE, modo)
    } catch {
      // sem localStorage, vale só até recarregar
    }
  }

  function refresh() {
    return listQuotes()
      .then(setQuotes)
      .catch((err) => void avisar(err instanceof Error ? err.message : 'Erro ao carregar dados do servidor.'))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  // cotações a partir de "PEDIDO DE COMPRA" (esse status em diante, no fluxo de QUOTE_STATUSES)
  // aparecem sozinhas aqui, sem precisar procurar — assim que o status muda em Cotações, na
  // próxima vez que essa aba abre a cotação já está na lista, e continua aparecendo enquanto
  // avança pelo resto do fluxo (confirmado, em transporte, entregue etc.)
  const indicePedidoDeCompra = QUOTE_STATUSES.indexOf('PEDIDO DE COMPRA')
  const cotacoesEmPedido = useMemo(
    () =>
      quotes
        // arquivada sem nunca ter virado pedido (não fechou) não é pedido de compra — continua na busca abaixo
        .filter((q) => QUOTE_STATUSES.indexOf(q.status) >= indicePedidoDeCompra && !(q.status === 'ARQUIVO' && !q.pedidoCompra))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [quotes, indicePedidoDeCompra],
  )

  const cotacao = useMemo(() => quotes.find((q) => q.id === cotacaoId), [quotes, cotacaoId])

  // só os itens que realmente entraram no pedido de compra (ver PedidoCompraModal) — uma cotação
  // pode ter sido fechada só com "alguns itens", e o resto (que não foi pedido) não deve aparecer
  // aqui nem entrar nos totais. Cotações antigas, de antes desse controle existir, não têm
  // pedidoCompra salvo — nesse caso cai pra todos os itens, como sempre foi.
  const itensDoPedido = useMemo(() => {
    if (!cotacao) return []
    const ids = cotacao.pedidoCompra?.itemIds
    if (!ids) return cotacao.items
    const permitidos = new Set(ids)
    return cotacao.items.filter((item) => permitidos.has(item.id))
  }, [cotacao])

  useEffect(() => {
    if (!cotacao) {
      setFechados({})
      return
    }
    // valor fechado começa igual ao negociado — a maioria dos itens fecha no mesmo valor, só
    // ajusta quem realmente mudou na negociação final, em vez de partir tudo zerado
    const iniciais: Record<string, ItemFechado> = {}
    for (const item of itensDoPedido) {
      iniciais[item.id] = cotacao.itensFechados?.[item.id] ?? {
        qtd: item.product.qtd,
        valorUnt: item.product.valorUnt,
        freteRate: item.product.freteRate,
      }
    }
    setFechados(iniciais)
    setSalvo(false)
  }, [cotacao, itensDoPedido])

  function patchFechado(itemId: string, patch: Partial<ItemFechado>) {
    setFechados((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }))
  }

  function patchFreteUnitFechado(itemId: string, novoFreteUnitario: number) {
    const atual = fechados[itemId]
    const valorUnt = atual?.valorUnt || 0
    patchFechado(itemId, { freteRate: valorUnt > 0 ? novoFreteUnitario / valorUnt : 0 })
  }

  function aplicarTaxaNoGrupo(items: QuoteItem[], taxa: number) {
    setFechados((prev) => {
      const novo = { ...prev }
      for (const item of items) novo[item.id] = { ...prev[item.id], freteRate: taxa }
      return novo
    })
  }

  async function handleSalvar() {
    if (!cotacao) return
    setSalvando(true)
    try {
      // mescla com o que já estava salvo — "fechados" só cobre os itens visíveis aqui (os que
      // entraram no pedido); itens fora do pedido não devem ter o valor fechado deles apagado
      const mesclado = { ...cotacao.itensFechados, ...fechados }
      const atualizado = await salvarItensFechados(cotacao.id, mesclado)
      setQuotes((prev) => prev.map((q) => (q.id === atualizado.id ? atualizado : q)))
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2000)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleStatusChange(novoStatus: QuoteStatus) {
    if (!cotacao) return
    if (novoStatus === 'PEDIDO DE COMPRA') {
      setPedidoModalAberto(true)
      return
    }
    if (novoStatus === 'EM TRANSPORTE') {
      setTransporteModalAberto(true)
      return
    }
    // arquivar sempre pede o motivo de a cotação não ter fechado — sem motivo, não arquiva
    const arquivamento =
      novoStatus === 'ARQUIVO' ? await pedirMotivoArquivamento(`Por que a cotação ${cotacao.codigo || ''} não foi fechada?`) : undefined
    if (novoStatus === 'ARQUIVO' && !arquivamento) return
    try {
      await updateQuoteStatus(cotacao.id, novoStatus, currentAdmin, undefined, arquivamento ?? undefined)
      await refresh()
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  /** Dados de transporte do formulário → como ficam gravados (link arrumado, quem e quando). */
  function carimbarTransporte(dados: Record<string, DadosTransporteEditaveis>): Record<string, DadosTransporte> {
    const agora = Date.now()
    return Object.fromEntries(
      Object.entries(dados).map(([chave, d]) => [
        chave,
        {
          numeroNotaFiscal: d.numeroNotaFiscal.trim(),
          numeroCotacaoFrete: d.numeroCotacaoFrete.trim(),
          transportadora: d.transportadora.trim(),
          linkRastreio: normalizarLinkRastreio(d.linkRastreio) ?? '',
          previsaoEntrega: d.previsaoEntrega || '',
          atualizadoEm: agora,
          atualizadoPor: currentAdmin,
        },
      ]),
    )
  }

  async function handleConfirmarTransporte(dados: Record<string, DadosTransporteEditaveis>) {
    if (!cotacao) return
    try {
      await updateQuoteStatus(cotacao.id, 'EM TRANSPORTE', currentAdmin)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
      return
    }
    try {
      await salvarTransporte(cotacao.id, carimbarTransporte(dados))
    } catch (err) {
      void avisar(
        `O status mudou para EM TRANSPORTE, mas os dados do envio não foram salvos (${err instanceof Error ? err.message : 'erro no servidor'}). ` +
          'Preencha de novo no cartão Transporte de cada fornecedor.',
      )
    }
    setTransporteModalAberto(false)
    await refresh()
  }

  async function handleSalvarTransporteGrupo(chave: string, dados: DadosTransporteEditaveis) {
    if (!cotacao) return
    try {
      const atualizado = await salvarTransporte(cotacao.id, carimbarTransporte({ [chave]: dados }))
      setQuotes((prev) => prev.map((q) => (q.id === atualizado.id ? atualizado : q)))
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
      throw err
    }
  }

  async function handleConfirmarPedidoCompra(info: PedidoCompraInfo) {
    if (!cotacao) return
    try {
      await updateQuoteStatus(cotacao.id, 'PEDIDO DE COMPRA', currentAdmin, info)
      setPedidoModalAberto(false)
      await refresh()
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  // divide os itens do pedido por fornecedor (+ UF de origem) — um pedido de compra pode ter saído
  // fechado com mais de um fornecedor, e cada um tem seu próprio frete (origem diferente, cotação
  // diferente); o mesmo fornecedor saindo de outro estado também é outro pedido, com outro frete
  const gruposPorFornecedor = useMemo(() => {
    const mapa = new Map<string, { remetente: RemetenteFrete; items: QuoteItem[] }>()
    for (const item of itensDoPedido) {
      const nome = item.product.fornecedor.trim()
      const remetente: RemetenteFrete = nome ? { nome, uf: item.product.estadoOrigem } : { nome: '' }
      const chave = chaveFornecedorFrete(remetente.nome, remetente.uf)
      if (!mapa.has(chave)) mapa.set(chave, { remetente, items: [] })
      mapa.get(chave)!.items.push(item)
    }
    const remetentes = Array.from(mapa.values()).map((g) => g.remetente)
    return Array.from(mapa.entries()).map(([chave, g]) => ({
      chave,
      remetente: g.remetente,
      fornecedor: g.remetente.nome || 'Sem fornecedor definido',
      rotulo: g.remetente.nome ? rotuloRemetente(g.remetente, remetentes) : 'Sem fornecedor definido',
      items: g.items,
    }))
  }, [itensDoPedido])

  const totaisGerais = useMemo(() => estatisticasGrupo(itensDoPedido, fechados), [itensDoPedido, fechados])
  const corStatus = cotacao ? corPadraoDoStatus(cotacao.status) : '#999'

  // dados do pedido pro fornecedor com o modal aberto no momento — usa o valor/qtd FECHADO (o que
  // realmente saiu, ver estatisticasGrupo), não o negociado na cotação original
  const dadosPedidoFornecedorAberto = useMemo((): BasePedidoCompraFornecedor | undefined => {
    if (!pedidoFornecedorAberto || !cotacao) return undefined
    const grupo = gruposPorFornecedor.find((g) => g.chave === pedidoFornecedorAberto)
    if (!grupo) return undefined
    const chaveFornecedor = chaveFornecedorFrete(grupo.fornecedor)

    // transportadora: a do envio (se já informada ao ir pra EM TRANSPORTE), senão a da cotação de
    // frete mais barata desse fornecedor/UF (aba Frete / Itens da cotação)
    const transportadoraSugerida =
      cotacao.transportePorFornecedor?.[chaveTransporte(grupo.chave)]?.transportadora || freteMaisBarato(cotacao, grupo.remetente)?.[0]

    // prazo: o que esse fornecedor informou na cotação dele, se for o mesmo pra todos os itens
    const prazos = new Set(
      grupo.items.map(
        (item) =>
          item.product.cotacoesFornecedores
            ?.find((c) => chaveFornecedorFrete(c.fornecedor) === chaveFornecedor)
            ?.prazoEntrega?.trim()
            .toUpperCase() ?? '',
      ),
    )
    const prazoSugerido = prazos.size === 1 ? Array.from(prazos)[0] || undefined : undefined

    return {
      chave: `${cotacao.id}|${grupo.chave}`,
      fornecedor: grupo.fornecedor,
      codigoCotacao: cotacao.codigo || '',
      comprador: currentAdmin,
      transportadoraSugerida,
      prazoSugerido,
      itens: grupo.items.map((item) => {
        const f = fechados[item.id] ?? {
          qtd: item.product.qtd,
          valorUnt: item.product.valorUnt,
          freteRate: item.product.freteRate,
        }
        return {
          qtd: f.qtd || 0,
          referencia: item.product.referencia,
          marca: item.product.marca,
          interno: item.product.interno,
          descricao: item.product.descricao,
          valorUnitario: f.valorUnt || 0,
        }
      }),
    }
  }, [pedidoFornecedorAberto, cotacao, gruposPorFornecedor, fechados, currentAdmin])

  const cotacaoOptions = [
    { value: '', label: '— buscar outra cotação —' },
    ...quotes.map((q) => ({ value: q.id, label: `${q.codigo || 'sem código'} — ${q.cliente || 'sem cliente'} (${q.status})` })),
  ]

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Pedido de Compra</h2>
        <p className="text-sm text-ink-400">
          Compare o que foi negociado na cotação com o que realmente fechou com cada fornecedor — a diferença é o
          que se ganhou (ou perdeu) em cima do produto e do frete. Mudar o status aqui muda também na Cotação: é o
          mesmo registro, só os valores de item ficam independentes pra permitir a comparação.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-display text-base font-semibold text-ink-900">Cotações em Pedido de Compra</h3>
        </div>
        {loading ? (
          <p className="text-sm text-ink-400 py-4 text-center">Carregando…</p>
        ) : cotacoesEmPedido.length === 0 ? (
          <p className="text-sm text-ink-400 py-4 text-center">Nenhuma cotação em Pedido de Compra no momento.</p>
        ) : (
          <div className="space-y-1.5">
            {cotacoesEmPedido.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setCotacaoId(q.id)}
                className={`w-full flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  cotacaoId === q.id ? 'border-ink-400 bg-ink-100' : 'border-ink-100 hover:border-ink-300 hover:bg-ink-50'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-ink-800 truncate">
                    {q.codigo || 'sem código'} — {q.cliente || 'sem cliente'}
                  </span>
                  <span
                    className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: corPadraoDoStatus(q.status), color: corTexto(corPadraoDoStatus(q.status)) }}
                  >
                    {q.status}
                  </span>
                  {previsaoDaCotacao(q) && <SeloPrevisao previsao={previsaoDaCotacao(q)!} />}
                </span>
                <span className="text-ink-400 shrink-0">{q.maquina}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-ink-100">
          <SelectField label="Ou busque qualquer cotação" value={cotacaoId} onChange={setCotacaoId} options={cotacaoOptions} />
        </div>
      </div>

      {cotacao && (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-base font-semibold text-ink-900">
                {cotacao.codigo || 'sem código'} — {cotacao.cliente || 'sem cliente'}
              </p>
              <p className="text-sm text-ink-400">
                {cotacao.maquina} · {cotacao.vendedor || 'sem vendedor'}
              </p>
            </div>
            <label className="flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: corStatus, color: corTexto(corStatus) }}
              >
                {cotacao.status}
              </span>
              <select
                value={cotacao.status}
                onChange={(e) => handleStatusChange(e.target.value as QuoteStatus)}
                className="field-input text-xs py-1.5 w-auto"
              >
                {QUOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display text-base font-semibold text-ink-900">
                Resumo geral {gruposPorFornecedor.length > 1 ? `(${gruposPorFornecedor.length} fornecedores)` : ''}
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-ink-500" role="group" aria-label="Frete em reais ou em porcentagem">
                  Frete em:
                  {(['valor', 'percentual'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={modoFrete === m}
                      onClick={() => mudarModoFrete(m)}
                      className={`pill-tab border py-1 text-xs ${
                        modoFrete === m ? 'bg-ink-950 border-ink-950 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                      }`}
                    >
                      {m === 'valor' ? 'R$' : '%'}
                    </button>
                  ))}
                </div>
                <Button variant="primary" onClick={handleSalvar} disabled={salvando}>
                  Salvar dados
                </Button>
                {salvo && <span className="text-xs text-emerald-600">Salvo!</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatVenda label="Valor de venda (passado ao cliente)" valor={valorDeVenda(itensDoPedido)} />
              <MiniStat label="Valor dos produtos" negociado={totaisGerais.valorNegociado} fechado={totaisGerais.valorFechado} />
              <MiniStat label="Frete total" negociado={totaisGerais.freteNegociado} fechado={totaisGerais.freteFechado} />
              <MiniStat label="Frete unitário médio" negociado={totaisGerais.freteUnitNegociado} fechado={totaisGerais.freteUnitFechado} />
              <MiniStat
                label="Total geral"
                negociado={totaisGerais.valorNegociado + totaisGerais.freteNegociado}
                fechado={totaisGerais.valorFechado + totaisGerais.freteFechado}
              />
            </div>
          </div>

          {gruposPorFornecedor.map((grupo) => {
            const est = estatisticasGrupo(grupo.items, fechados)
            return (
              <div key={grupo.chave || '__sem_fornecedor__'} className="card">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="font-display text-base font-semibold text-ink-900">
                    Fornecedor: {grupo.rotulo}
                    {grupo.remetente.uf && grupo.rotulo === grupo.fornecedor && (
                      <span className="ml-2 rounded border border-ink-300 px-1 py-px font-mono text-[11px] font-semibold text-ink-600">
                        {grupo.remetente.uf}
                      </span>
                    )}
                  </h3>
                  <Button variant="secondary" onClick={() => setPedidoFornecedorAberto(grupo.chave)}>
                    Gerar pedido de compra
                  </Button>
                </div>
                {QUOTE_STATUSES.indexOf(cotacao.status) >= INDICE_EM_TRANSPORTE && (
                  <CartaoTransporte
                    key={`${grupo.chave}-${cotacao.transportePorFornecedor?.[chaveTransporte(grupo.chave)]?.atualizadoEm ?? 0}`}
                    chave={chaveTransporte(grupo.chave)}
                    inicial={transporteInicial(cotacao, grupo.chave, grupo.remetente)}
                    salvoEm={cotacao.transportePorFornecedor?.[chaveTransporte(grupo.chave)]?.atualizadoEm}
                    salvoPor={cotacao.transportePorFornecedor?.[chaveTransporte(grupo.chave)]?.atualizadoPor}
                    onSalvar={(dados) => handleSalvarTransporteGrupo(chaveTransporte(grupo.chave), dados)}
                  />
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <MiniStat label="Frete total" negociado={est.freteNegociado} fechado={est.freteFechado} />
                  <MiniStat label="Frete unitário" negociado={est.freteUnitNegociado} fechado={est.freteUnitFechado} />
                  <MiniStat label="Valor dos produtos" negociado={est.valorNegociado} fechado={est.valorFechado} />
                  <StatVenda label="Valor de venda" valor={valorDeVenda(grupo.items)} />
                </div>
                <AplicarFreteGrupo modo={modoFrete} valorProdutos={est.valorFechado} onAplicar={(taxa) => aplicarTaxaNoGrupo(grupo.items, taxa)} />

                <div className="overflow-x-auto rounded-xl border border-ink-100">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-ink-50 text-left text-ink-400">
                        <th className="py-2 px-2 font-medium min-w-[10rem]">Produto</th>
                        <th className="py-2 px-2 font-medium w-20 text-right">Qtd negoc.</th>
                        <th className="py-2 px-2 font-medium w-20 text-right">Qtd fechada</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">Vlr unt. negoc.</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">Vlr unt. fechado</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">{modoFrete === 'valor' ? 'Frete unt. negoc.' : 'Frete negoc. (%)'}</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">{modoFrete === 'valor' ? 'Frete unt. fechado' : 'Frete fechado (%)'}</th>
                        <th className="py-2 px-2 font-medium w-28 text-right">Total negociado</th>
                        <th className="py-2 px-2 font-medium w-28 text-right">Total fechado</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">Diferença</th>
                        <th className="py-2 px-2 font-medium w-24 text-right bg-sky-50/60">Venda unt.</th>
                        <th className="py-2 px-2 font-medium w-28 text-right bg-sky-50/60">Venda total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.items.map((item) => {
                        const f = fechados[item.id] ?? {
                          qtd: item.product.qtd,
                          valorUnt: item.product.valorUnt,
                          freteRate: item.product.freteRate,
                        }
                        const totalNegociado = (item.product.qtd || 0) * (item.product.valorUnt || 0)
                        const totalFechado = (f.qtd || 0) * (f.valorUnt || 0)
                        const freteUnitNegociado = (item.product.valorUnt || 0) * (item.product.freteRate || 0)
                        const freteUnitFechado = (f.valorUnt || 0) * (f.freteRate || 0)
                        const dif = totalFechado - totalNegociado
                        return (
                          <tr key={item.id} className="border-t border-ink-100">
                            <td className="py-1.5 px-2 text-ink-800">
                              {item.product.descricao || item.product.referencia || 'Item sem descrição'}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ink-500">
                              {item.product.qtd}
                            </td>
                            <td className="py-1.5 px-1">
                              <input
                                type="number"
                                min={0}
                                className="field-input text-right tabular-nums py-1"
                                value={f.qtd}
                                onChange={(e) => patchFechado(item.id, { qtd: Number(e.target.value) || 0 })}
                              />
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ink-500">
                              {formatCurrency(item.product.valorUnt)}
                            </td>
                            <td className="py-1.5 px-1">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="field-input text-right tabular-nums py-1"
                                value={f.valorUnt}
                                onChange={(e) => patchFechado(item.id, { valorUnt: Number(e.target.value) || 0 })}
                              />
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ink-500">
                              {modoFrete === 'valor' ? formatCurrency(freteUnitNegociado) : percentual(item.product.freteRate)}
                            </td>
                            <td className="py-1.5 px-1">
                              {modoFrete === 'valor' ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="field-input text-right tabular-nums py-1"
                                  aria-label={`Frete unitário fechado (R$) — ${item.product.referencia || item.product.descricao}`}
                                  value={Math.round(freteUnitFechado * 100) / 100}
                                  onChange={(e) => patchFreteUnitFechado(item.id, Number(e.target.value) || 0)}
                                />
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  className="field-input text-right tabular-nums py-1"
                                  aria-label={`Frete fechado (%) — ${item.product.referencia || item.product.descricao}`}
                                  title={`= ${formatCurrency(freteUnitFechado)} por unidade`}
                                  value={Math.round((f.freteRate || 0) * 10000) / 100}
                                  onChange={(e) => patchFechado(item.id, { freteRate: (Number(e.target.value) || 0) / 100 })}
                                />
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ink-500">
                              {formatCurrency(totalNegociado)}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ink-800">
                              {formatCurrency(totalFechado)}
                            </td>
                            <td
                              className={`py-1.5 px-2 text-right font-mono tabular-nums ${
                                dif < 0 ? 'text-emerald-600' : dif > 0 ? 'text-rose-600' : 'text-ink-400'
                              }`}
                            >
                              {dif > 0 ? '+' : ''}
                              {formatCurrency(dif)}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ink-800 bg-sky-50/40">
                              {formatCurrency(precoDeVenda(item))}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ink-800 bg-sky-50/40">
                              {formatCurrency(precoDeVenda(item) * (item.product.qtd || 0))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </>
      )}

      {transporteModalAberto && cotacao && (
        <TransporteModal
          codigoCotacao={cotacao.codigo}
          grupos={gruposPorFornecedor.map((g) => ({
            chave: chaveTransporte(g.chave),
            rotulo: g.rotulo,
            inicial: transporteInicial(cotacao, g.chave, g.remetente),
          }))}
          onConfirmar={handleConfirmarTransporte}
          onCancelar={() => setTransporteModalAberto(false)}
        />
      )}

      {pedidoModalAberto && cotacao && (
        <PedidoCompraModal quote={cotacao} onConfirm={handleConfirmarPedidoCompra} onCancel={() => setPedidoModalAberto(false)} />
      )}

      {dadosPedidoFornecedorAberto && (
        <PedidoCompraFornecedorModal
          key={dadosPedidoFornecedorAberto.chave}
          base={dadosPedidoFornecedorAberto}
          onClose={() => setPedidoFornecedorAberto(undefined)}
        />
      )}
    </div>
  )
}
