import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { formatCurrency, selecionarTudoAoFocar } from '../utils'
import { ESTADOS } from '../data/estados'
import { listFornecedores } from '../db/fornecedoresRepo'
import type { Fornecedor, ProductInput, QuoteItem } from '../types'

type ModoFrete = 'pct' | 'valor'

export function QuoteItemsList({
  items,
  activeItemId,
  onSelect,
  onAdd,
  onRemove,
  onPatchItem,
  onApplyMarginToAll,
  onGoToComparar,
}: {
  items: QuoteItem[]
  activeItemId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onPatchItem: (id: string, patch: Partial<ProductInput>) => void
  onApplyMarginToAll: (lucroPct: number) => void
  onGoToComparar: () => void
}) {
  const [margemUnica, setMargemUnica] = useState('')
  const [modoFrete, setModoFrete] = useState<ModoFrete>('pct')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedorAbertoId, setFornecedorAbertoId] = useState<string | null>(null)

  useEffect(() => {
    listFornecedores()
      .then(setFornecedores)
      .catch(() => {
        // sugestão é só um extra — se o servidor estiver fora, o campo continua livre normalmente
      })
  }, [])

  useEffect(() => {
    function fecharAoClicarFora() {
      setFornecedorAbertoId(null)
    }
    document.addEventListener('mousedown', fecharAoClicarFora)
    return () => document.removeEventListener('mousedown', fecharAoClicarFora)
  }, [])

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
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onGoToComparar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 transition"
          >
            Comparar fornecedores
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
          >
            + Adicionar item
          </button>
        </div>
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
              <th className="py-2 px-2 font-medium min-w-[7rem]">NCM</th>
              <th className="py-2 px-2 font-medium min-w-[10rem]">Fornecedor</th>
              <th className="py-2 px-2 font-medium w-24">UF</th>
              <th className="py-2 px-2 font-medium w-20 text-right">Qtd</th>
              <th className="py-2 px-2 font-medium w-28 text-right">Valor unt.</th>
              <th className="py-2 px-2 font-medium w-32">
                <div className="flex items-center justify-end gap-1">
                  <span>Frete</span>
                  <span className="inline-flex rounded-md border border-ink-200 overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => setModoFrete('pct')}
                      className={`px-1.5 py-0.5 text-[10px] font-medium transition ${
                        modoFrete === 'pct' ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoFrete('valor')}
                      className={`px-1.5 py-0.5 text-[10px] font-medium border-l border-ink-200 transition ${
                        modoFrete === 'valor' ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
                      }`}
                    >
                      R$
                    </button>
                  </span>
                </div>
              </th>
              <th className="py-2 px-2 font-medium min-w-[7rem]">Prazo</th>
              <th className="py-2 px-2 font-medium w-32 text-right">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const isActive = item.id === activeItemId
              const totalItens = (item.product.qtd || 0) * (item.product.valorUnt || 0)
              return (
                <LinhaItem
                  key={item.id}
                  item={item}
                  index={index}
                  isActive={isActive}
                  totalItens={totalItens}
                  modoFrete={modoFrete}
                  fornecedores={fornecedores}
                  fornecedorAberto={fornecedorAbertoId === item.id}
                  onAbrirFornecedor={() => setFornecedorAbertoId(item.id)}
                  onFecharFornecedor={() => setFornecedorAbertoId((atual) => (atual === item.id ? null : atual))}
                  onSelect={() => onSelect(item.id)}
                  onRemove={() => onRemove(item.id)}
                  onPatch={(patch) => onPatchItem(item.id, patch)}
                  podeRemover={items.length > 1}
                  cellCls={cellCls}
                  inputCls={inputCls}
                  stop={stop}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LinhaItem({
  item,
  index,
  isActive,
  totalItens,
  modoFrete,
  fornecedores,
  fornecedorAberto,
  onAbrirFornecedor,
  onFecharFornecedor,
  onSelect,
  onRemove,
  onPatch,
  podeRemover,
  cellCls,
  inputCls,
  stop,
}: {
  item: QuoteItem
  index: number
  isActive: boolean
  totalItens: number
  modoFrete: ModoFrete
  fornecedores: Fornecedor[]
  fornecedorAberto: boolean
  onAbrirFornecedor: () => void
  onFecharFornecedor: () => void
  onSelect: () => void
  onRemove: () => void
  onPatch: (patch: Partial<ProductInput>) => void
  podeRemover: boolean
  cellCls: string
  inputCls: string
  stop: (e: MouseEvent) => void
}) {
  const vlrProduto = (item.product.qtd || 0) * (item.product.valorUnt || 0)
  const valorFreteAtual = vlrProduto * (item.product.freteRate || 0)

  const sugestoesFornecedor = useMemo(() => {
    const termo = item.product.fornecedor.trim().toLowerCase()
    const lista = termo ? fornecedores.filter((f) => f.nome.toLowerCase().includes(termo)) : fornecedores
    return lista.slice(0, 6)
  }, [fornecedores, item.product.fornecedor])

  function handleSelecionarFornecedor(f: Fornecedor) {
    onPatch({ fornecedor: f.nome, ...(f.estado ? { estadoOrigem: f.estado } : {}) })
    onFecharFornecedor()
  }

  return (
    <tr onClick={onSelect} className={`cursor-pointer transition ${isActive ? 'bg-brand-50' : 'hover:bg-ink-50'}`}>
      <td className={`${cellCls} text-ink-400 text-xs text-center`}>{index + 1}</td>
      <td className={cellCls}>
        <input
          className={`${inputCls} font-mono`}
          value={item.product.interno}
          onChange={(e) => onPatch({ interno: e.target.value })}
          onClick={stop}
        />
      </td>
      <td className={cellCls}>
        <input
          className={inputCls}
          value={item.product.referencia}
          onChange={(e) => onPatch({ referencia: e.target.value })}
          onClick={stop}
        />
      </td>
      <td className={cellCls}>
        <input
          className={inputCls}
          value={item.product.descricao}
          onChange={(e) => onPatch({ descricao: e.target.value })}
          onClick={stop}
        />
      </td>
      <td className={cellCls}>
        <input
          className={`${inputCls} font-mono`}
          placeholder="0000.00.00"
          value={item.product.ncm}
          onChange={(e) => onPatch({ ncm: e.target.value })}
          onClick={stop}
        />
      </td>
      <td className={`${cellCls} relative`}>
        <input
          className={inputCls}
          value={item.product.fornecedor}
          onChange={(e) => {
            onPatch({ fornecedor: e.target.value })
            onAbrirFornecedor()
          }}
          onFocus={onAbrirFornecedor}
          onClick={(e) => {
            stop(e)
            onAbrirFornecedor()
          }}
        />
        {fornecedorAberto && sugestoesFornecedor.length > 0 && (
          <div
            className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-ink-200 bg-surface shadow-lg max-h-56 overflow-auto"
            onClick={stop}
            onMouseDown={stop}
          >
            {sugestoesFornecedor.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleSelecionarFornecedor(f)}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-ink-50 focus:bg-ink-50 focus:outline-none"
              >
                {f.nome}
                {f.cidade ? <span className="text-ink-400"> — {f.cidade}{f.estado ? ` / ${f.estado}` : ''}</span> : null}
              </button>
            ))}
          </div>
        )}
      </td>
      <td className={cellCls}>
        <select
          className={inputCls}
          value={item.product.estadoOrigem}
          onChange={(e) => onPatch({ estadoOrigem: e.target.value })}
          onClick={stop}
        >
          {ESTADOS.map((e) => (
            <option key={e.uf} value={e.uf}>
              {e.uf}
            </option>
          ))}
        </select>
      </td>
      <td className={cellCls}>
        <input
          type="number"
          min={0}
          className={`${inputCls} text-right tabular-nums`}
          value={item.product.qtd}
          onChange={(e) => onPatch({ qtd: Number(e.target.value) || 0 })}
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
          onChange={(e) => onPatch({ valorUnt: Number(e.target.value) || 0 })}
          onClick={stop}
          onFocus={selecionarTudoAoFocar}
        />
      </td>
      <td className={cellCls}>
        {modoFrete === 'pct' ? (
          <input
            type="number"
            min={0}
            step={0.1}
            className={`${inputCls} text-right tabular-nums`}
            value={Math.round((item.product.freteRate || 0) * 10000) / 100}
            onChange={(e) => onPatch({ freteRate: (Number(e.target.value) || 0) / 100 })}
            onClick={stop}
            onFocus={selecionarTudoAoFocar}
          />
        ) : (
          <input
            type="number"
            min={0}
            step={0.01}
            className={`${inputCls} text-right tabular-nums`}
            value={Math.round(valorFreteAtual * 100) / 100}
            onChange={(e) => {
              const novoValor = Number(e.target.value) || 0
              onPatch({ freteRate: vlrProduto > 0 ? novoValor / vlrProduto : 0 })
            }}
            onClick={stop}
            onFocus={selecionarTudoAoFocar}
          />
        )}
      </td>
      <td className={cellCls}>
        <input
          className={inputCls}
          placeholder="ex.: 2 DIAS"
          value={item.product.prazoEntrega}
          onChange={(e) => onPatch({ prazoEntrega: e.target.value })}
          onClick={stop}
        />
      </td>
      <td className={`${cellCls} text-right font-mono tabular-nums text-ink-800 pr-3`}>{formatCurrency(totalItens)}</td>
      <td className={`${cellCls} text-center`}>
        {podeRemover && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
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
}
