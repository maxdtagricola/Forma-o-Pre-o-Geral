import { Button } from './ui/Basics'
import { resolverPedidoAtual, usePedidoDialog } from '../dialogs'

/** Renderiza a caixa de confirmar()/avisar() atual (ver src/dialogs.ts) — sempre centrada na tela e
 * por cima de qualquer outro modal, com uma entrada animada. Montado uma vez, perto da raiz do app. */
export function DialogHost() {
  const pedido = usePedidoDialog()
  if (!pedido) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[dialog-fade-in_0.15s_ease-out]"
      onMouseDown={(e) => {
        // clicar fora só fecha o aviso simples — numa confirmação, obriga escolher um dos botões
        if (e.target === e.currentTarget && pedido.tipo === 'avisar') resolverPedidoAtual()
      }}
    >
      <div className="card max-w-sm w-full animate-[dialog-pop-in_0.18s_cubic-bezier(0.16,1,0.3,1)]">
        {pedido.titulo && <h3 className="font-display text-lg font-semibold text-ink-900 mb-1">{pedido.titulo}</h3>}
        <p className="text-sm text-ink-600 whitespace-pre-line">{pedido.mensagem}</p>
        <div className="mt-5 flex gap-2 justify-end">
          {pedido.tipo === 'confirmar' && (
            <Button variant="secondary" onClick={() => resolverPedidoAtual(false)}>
              {pedido.cancelText}
            </Button>
          )}
          {pedido.tipo === 'confirmar' && pedido.tone === 'danger' ? (
            <button
              type="button"
              onClick={() => resolverPedidoAtual(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
            >
              {pedido.confirmText}
            </button>
          ) : (
            <Button variant="primary" onClick={() => resolverPedidoAtual(true)}>
              {pedido.tipo === 'confirmar' ? pedido.confirmText : pedido.okText}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
