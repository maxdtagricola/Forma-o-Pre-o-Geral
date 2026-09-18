import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Basics'
import { SelectField } from '../components/ui/Field'
import { PedidoCompraModal } from '../components/PedidoCompraModal'
import { listQuotes, salvarItensFechados, updateQuoteStatus } from '../db/analysesRepo'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { formatCurrency } from '../utils'
import { QUOTE_STATUSES } from '../types'
import type { ItemFechado, PedidoCompraInfo, QuoteRecord, QuoteStatus } from '../types'

/** Compara, item a item, o que foi negociado na cotação (item.product) com o que realmente saiu
 * no fechamento do pedido com o fornecedor — os dois ficam separados de propósito: a negociação
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

  const totais = useMemo(() => {
    if (!cotacao) return { negociado: 0, fechado: 0 }
    let negociado = 0
    let fechado = 0
    for (const item of cotacao.items) {
      negociado += (item.product.qtd || 0) * (item.product.valorUnt || 0)
      const f = fechados[item.id]
      if (f) fechado += (f.qtd || 0) * (f.valorUnt || 0)
    }
    return { negociado, fechado }
  }, [cotacao, fechados])

  const diferenca = totais.negociado - totais.fechado
  const corStatus = cotacao ? corPadraoDoStatus(cotacao.status) : '#999'

  const cotacaoOptions = [
    { value: '', label: '— selecione uma cotação —' },
    ...quotes.map((q) => ({ value: q.id, label: `${q.codigo || 'sem código'} — ${q.cliente || 'sem cliente'}` })),
  ]

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Pedido de Compra</h2>
        <p className="text-sm text-ink-400">
          Compare o que foi negociado na cotação com o que realmente fechou com o fornecedor — a diferença é o que
          se ganhou (ou perdeu) em cima do produto. Mudar o status aqui muda também na Cotação: é o mesmo registro,
          só os valores de item ficam independentes pra permitir a comparação.
        </p>
      </div>

      <div className="card">
        <SelectField label="Cotação" value={cotacaoId} onChange={setCotacaoId} options={cotacaoOptions} />
      </div>

      {loading ? (
        <div className="card text-center text-sm text-ink-400 py-10">Carregando…</div>
      ) : cotacao ? (
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
              <h3 className="font-display text-base font-semibold text-ink-900">Negociado × Fechado</h3>
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={handleSalvar} disabled={salvando}>
                  Salvar dados
                </Button>
                {salvo && <span className="text-xs text-emerald-600">Salvo!</span>}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-ink-50 text-left text-ink-400">
                    <th className="py-2 px-2 font-medium min-w-[12rem]">Produto</th>
                    <th className="py-2 px-2 font-medium w-24 text-right">Qtd negoc.</th>
                    <th className="py-2 px-2 font-medium w-24 text-right">Qtd fechada</th>
                    <th className="py-2 px-2 font-medium w-28 text-right">Vlr unt. negoc.</th>
                    <th className="py-2 px-2 font-medium w-28 text-right">Vlr unt. fechado</th>
                    <th className="py-2 px-2 font-medium w-32 text-right">Total negociado</th>
                    <th className="py-2 px-2 font-medium w-32 text-right">Total fechado</th>
                    <th className="py-2 px-2 font-medium w-28 text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {cotacao.items.map((item) => {
                    const f = fechados[item.id] ?? { qtd: item.product.qtd, valorUnt: item.product.valorUnt, freteRate: item.product.freteRate }
                    const totalNegociado = (item.product.qtd || 0) * (item.product.valorUnt || 0)
                    const totalFechado = (f.qtd || 0) * (f.valorUnt || 0)
                    const dif = totalNegociado - totalFechado
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
                          {formatCurrency(totalNegociado)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ink-800">
                          {formatCurrency(totalFechado)}
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-mono tabular-nums ${
                            dif > 0 ? 'text-emerald-600' : dif < 0 ? 'text-rose-600' : 'text-ink-400'
                          }`}
                        >
                          {dif > 0 ? '+' : ''}
                          {formatCurrency(dif)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-200 font-semibold">
                    <td className="py-2 px-2 text-ink-900" colSpan={5}>
                      Total
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-ink-900">
                      {formatCurrency(totais.negociado)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-ink-900">
                      {formatCurrency(totais.fechado)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right font-mono tabular-nums ${
                        diferenca > 0 ? 'text-emerald-600' : diferenca < 0 ? 'text-rose-600' : 'text-ink-900'
                      }`}
                    >
                      {diferenca > 0 ? '+' : ''}
                      {formatCurrency(diferenca)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card text-center text-sm text-ink-400 py-10">Escolha uma cotação pra comparar.</div>
      )}

      {pedidoModalAberto && cotacao && (
        <PedidoCompraModal quote={cotacao} onConfirm={handleConfirmarPedidoCompra} onCancel={() => setPedidoModalAberto(false)} />
      )}
    </div>
  )
}
