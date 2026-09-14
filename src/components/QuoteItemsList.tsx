import { useState, type MouseEvent } from 'react'
import { calculateItem } from '../calc/calculator'
import { formatCurrency, selecionarTudoAoFocar } from '../utils'
import type { ProductInput, QuoteItem } from '../types'

export function QuoteItemsList({
  items,
  activeItemId,
  onSelect,
  onAdd,
  onRemove,
  onPatchItem,
  onApplyMarginToAll,
}: {
  items: QuoteItem[]
  activeItemId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onPatchItem: (id: string, patch: Partial<ProductInput>) => void
  onApplyMarginToAll: (lucroPct: number) => void
}) {
  const [margemUnica, setMargemUnica] = useState('')

  const cellCls = 'px-1 py-1 border-t border-ink-100'
  const inputCls =
    'w-full bg-transparent border-0 rounded px-1.5 py-1.5 text-ink-800 focus:outline-none focus:ring-1 focus:ring-brand-400'

  function stop(e: MouseEvent) {
    e.stopPropagation()
  }

  function handleAplicarMargemUnica() {
    const valor = Number(margemUnica.replace(',', '.'))
    if (!margemUnica.trim() || Number.isNaN(valor)) {
      alert('Informe uma margem válida, em %.')
      return
    }
    onApplyMarginToAll(valor / 100)
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Itens da cotação</h2>
          <p className="text-sm text-ink-400">
            Edite direto na planilha — clique numa linha pra ver os campos avançados dela abaixo.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
        >
          + Adicionar item
        </button>
      </div>

      {items.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
          <span className="text-xs text-ink-500">Margem única pra todos os itens:</span>
          <input
            type="number"
            step={0.1}
            placeholder="%"
            value={margemUnica}
            onChange={(e) => setMargemUnica(e.target.value)}
            className="field-input w-20 py-1 text-sm"
          />
          <button
            type="button"
            onClick={handleAplicarMargemUnica}
            className="pill-tab border border-ink-200 text-ink-600 hover:bg-white"
          >
            Aplicar a todos
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-ink-50 text-left text-ink-400">
              <th className="py-2 px-2 font-medium w-8">#</th>
              <th className="py-2 px-2 font-medium min-w-[7rem]">Interno</th>
              <th className="py-2 px-2 font-medium min-w-[8rem]">Referência</th>
              <th className="py-2 px-2 font-medium min-w-[12rem]">Descrição</th>
              <th className="py-2 px-2 font-medium min-w-[9rem]">Fornecedor</th>
              <th className="py-2 px-2 font-medium w-20 text-right">Qtd</th>
              <th className="py-2 px-2 font-medium w-28 text-right">Valor unt.</th>
              <th className="py-2 px-2 font-medium w-24 text-right">Peso (kg)</th>
              <th className="py-2 px-2 font-medium min-w-[7rem]">Prazo</th>
              <th className="py-2 px-2 font-medium w-32 text-right">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const isActive = item.id === activeItemId
              const result = calculateItem(item.product, item.pricing)
              return (
                <tr
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={`cursor-pointer transition ${isActive ? 'bg-brand-50' : 'hover:bg-ink-50'}`}
                >
                  <td className={`${cellCls} text-ink-400 text-xs text-center`}>{index + 1}</td>
                  <td className={cellCls}>
                    <input
                      className={`${inputCls} font-mono`}
                      value={item.product.interno}
                      onChange={(e) => onPatchItem(item.id, { interno: e.target.value })}
                      onClick={stop}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      className={inputCls}
                      value={item.product.referencia}
                      onChange={(e) => onPatchItem(item.id, { referencia: e.target.value })}
                      onClick={stop}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      className={inputCls}
                      value={item.product.descricao}
                      onChange={(e) => onPatchItem(item.id, { descricao: e.target.value })}
                      onClick={stop}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      className={inputCls}
                      value={item.product.fornecedor}
                      onChange={(e) => onPatchItem(item.id, { fornecedor: e.target.value })}
                      onClick={stop}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      type="number"
                      min={0}
                      className={`${inputCls} text-right tabular-nums`}
                      value={item.product.qtd}
                      onChange={(e) => onPatchItem(item.id, { qtd: Number(e.target.value) || 0 })}
                      onClick={stop}
                      onFocus={selecionarTudoAoFocar}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className={`${inputCls} text-right tabular-nums`}
                      value={item.product.valorUnt}
                      onChange={(e) => onPatchItem(item.id, { valorUnt: Number(e.target.value) || 0 })}
                      onClick={stop}
                      onFocus={selecionarTudoAoFocar}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className={`${inputCls} text-right tabular-nums`}
                      value={item.product.peso}
                      onChange={(e) => onPatchItem(item.id, { peso: Number(e.target.value) || 0 })}
                      onClick={stop}
                      onFocus={selecionarTudoAoFocar}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      className={inputCls}
                      placeholder="ex.: 2 DIAS"
                      value={item.product.prazoEntrega}
                      onChange={(e) => onPatchItem(item.id, { prazoEntrega: e.target.value })}
                      onClick={stop}
                    />
                  </td>
                  <td className={`${cellCls} text-right font-mono tabular-nums text-ink-800 pr-3`}>
                    {formatCurrency(result.precoVendaTotal)}
                  </td>
                  <td className={`${cellCls} text-center`}>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemove(item.id)
                        }}
                        aria-label="Remover item"
                        className="h-6 w-6 rounded-full text-xs leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
