import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Basics'
import { SelectField } from '../components/ui/Field'
import { PedidoCompraModal } from '../components/PedidoCompraModal'
import { listQuotes, salvarItensFechados, updateQuoteStatus } from '../db/analysesRepo'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { formatCurrency } from '../utils'
import { QUOTE_STATUSES } from '../types'
import type { ItemFechado, PedidoCompraInfo, QuoteItem, QuoteRecord, QuoteStatus } from '../types'

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

  function refresh() {
    return listQuotes()
      .then(setQuotes)
      .catch((err) => alert(err instanceof Error ? err.message : 'Erro ao carregar dados do servidor.'))
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
        .filter((q) => QUOTE_STATUSES.indexOf(q.status) >= indicePedidoDeCompra)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [quotes, indicePedidoDeCompra],
  )

  const cotacao = useMemo(() => quotes.find((q) => q.id === cotacaoId), [quotes, cotacaoId])

  useEffect(() => {
    if (!cotacao) {
      setFechados({})
      return
    }
    // valor fechado começa igual ao negociado — a maioria dos itens fecha no mesmo valor, só
    // ajusta quem realmente mudou na negociação final, em vez de partir tudo zerado
    const iniciais: Record<string, ItemFechado> = {}
    for (const item of cotacao.items) {
      iniciais[item.id] = cotacao.itensFechados?.[item.id] ?? {
        qtd: item.product.qtd,
        valorUnt: item.product.valorUnt,
        freteRate: item.product.freteRate,
      }
    }
    setFechados(iniciais)
    setSalvo(false)
  }, [cotacao])

  function patchFechado(itemId: string, patch: Partial<ItemFechado>) {
    setFechados((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }))
  }

  function patchFreteUnitFechado(itemId: string, novoFreteUnitario: number) {
    const atual = fechados[itemId]
    const valorUnt = atual?.valorUnt || 0
    patchFechado(itemId, { freteRate: valorUnt > 0 ? novoFreteUnitario / valorUnt : 0 })
  }

  async function handleSalvar() {
    if (!cotacao) return
    setSalvando(true)
    try {
      const atualizado = await salvarItensFechados(cotacao.id, fechados)
      setQuotes((prev) => prev.map((q) => (q.id === atualizado.id ? atualizado : q)))
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
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
    try {
      await updateQuoteStatus(cotacao.id, novoStatus, currentAdmin)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  async function handleConfirmarPedidoCompra(info: PedidoCompraInfo) {
    if (!cotacao) return
    try {
      await updateQuoteStatus(cotacao.id, 'PEDIDO DE COMPRA', currentAdmin, info)
      setPedidoModalAberto(false)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  // divide os itens da cotação por fornecedor — um pedido de compra pode ter saído fechado com
  // mais de um fornecedor, e cada um tem seu próprio frete (origem diferente, cotação diferente)
  const gruposPorFornecedor = useMemo(() => {
    if (!cotacao) return []
    const mapa = new Map<string, QuoteItem[]>()
    for (const item of cotacao.items) {
      const nome = item.product.fornecedor.trim() || 'Sem fornecedor definido'
      if (!mapa.has(nome)) mapa.set(nome, [])
      mapa.get(nome)!.push(item)
    }
    return Array.from(mapa.entries()).map(([fornecedor, items]) => ({ fornecedor, items }))
  }, [cotacao])

  const totaisGerais = useMemo(() => estatisticasGrupo(cotacao?.items ?? [], fechados), [cotacao, fechados])
  const corStatus = cotacao ? corPadraoDoStatus(cotacao.status) : '#999'

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
                  cotacaoId === q.id ? 'border-brand-400 bg-brand-50' : 'border-ink-100 hover:border-ink-300 hover:bg-ink-50'
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
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={handleSalvar} disabled={salvando}>
                  Salvar dados
                </Button>
                {salvo && <span className="text-xs text-emerald-600">Salvo!</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              <div key={grupo.fornecedor} className="card">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="font-display text-base font-semibold text-ink-900">Fornecedor: {grupo.fornecedor}</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  <MiniStat label="Frete total" negociado={est.freteNegociado} fechado={est.freteFechado} />
                  <MiniStat label="Frete unitário" negociado={est.freteUnitNegociado} fechado={est.freteUnitFechado} />
                  <MiniStat label="Valor dos produtos" negociado={est.valorNegociado} fechado={est.valorFechado} />
                </div>

                <div className="overflow-x-auto rounded-xl border border-ink-100">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-ink-50 text-left text-ink-400">
                        <th className="py-2 px-2 font-medium min-w-[10rem]">Produto</th>
                        <th className="py-2 px-2 font-medium w-20 text-right">Qtd negoc.</th>
                        <th className="py-2 px-2 font-medium w-20 text-right">Qtd fechada</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">Vlr unt. negoc.</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">Vlr unt. fechado</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">Frete unt. negoc.</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">Frete unt. fechado</th>
                        <th className="py-2 px-2 font-medium w-28 text-right">Total negociado</th>
                        <th className="py-2 px-2 font-medium w-28 text-right">Total fechado</th>
                        <th className="py-2 px-2 font-medium w-24 text-right">Diferença</th>
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
                              {formatCurrency(freteUnitNegociado)}
                            </td>
                            <td className="py-1.5 px-1">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="field-input text-right tabular-nums py-1"
                                value={Math.round(freteUnitFechado * 100) / 100}
                                onChange={(e) => patchFreteUnitFechado(item.id, Number(e.target.value) || 0)}
                              />
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

      {pedidoModalAberto && cotacao && (
        <PedidoCompraModal quote={cotacao} onConfirm={handleConfirmarPedidoCompra} onCancel={() => setPedidoModalAberto(false)} />
      )}
    </div>
  )
}
