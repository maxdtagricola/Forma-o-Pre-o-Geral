import { useState } from 'react'
import { Button } from './ui/Basics'
import type { PedidoCompraInfo, QuoteRecord } from '../types'

export function PedidoCompraModal({
  quote,
  onConfirm,
  onCancel,
}: {
  quote: QuoteRecord
  onConfirm: (info: PedidoCompraInfo) => void
  onCancel: () => void
}) {
  const [tipo, setTipo] = useState<'completo' | 'parcial'>('completo')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(quote.items.map((i) => i.id)))

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleConfirm() {
    const itemIds = tipo === 'completo' ? quote.items.map((i) => i.id) : Array.from(selecionados)
    if (itemIds.length === 0) {
      alert('Selecione pelo menos um item.')
      return
    }
    onConfirm({ tipo, itemIds })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold text-ink-900 mb-1">Pedido de compra</h3>
        <p className="text-sm text-ink-400 mb-4">O pedido é de todos os itens dessa cotação, ou só de alguns?</p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTipo('completo')}
            className={`pill-tab border ${
              tipo === 'completo' ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-200 text-ink-600'
            }`}
          >
            Pedido completo
          </button>
          <button
            type="button"
            onClick={() => setTipo('parcial')}
            className={`pill-tab border ${
              tipo === 'parcial' ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-200 text-ink-600'
            }`}
          >
            Só alguns itens
          </button>
        </div>

        {tipo === 'parcial' && (
          <div className="mb-4 max-h-52 overflow-auto space-y-1 rounded-lg border border-ink-100 p-2">
            {quote.items.map((item, i) => (
              <label key={item.id} className="flex items-center gap-2 py-1 text-sm text-ink-700">
                <input type="checkbox" checked={selecionados.has(item.id)} onChange={() => toggle(item.id)} />
                {item.product.referencia || item.product.descricao || `Item ${i + 1}`}
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={handleConfirm}>
            Confirmar
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}
