import { useState } from 'react'
import { Button } from './ui/Basics'
import { resolverArquivamento, resolverPedidoAtual, usePedidoDialog, type PedidoDialog } from '../dialogs'
import { MOTIVOS_ARQUIVAMENTO } from '../types'

/** Renderiza a caixa de confirmar()/avisar()/pedirSenha() atual (ver src/dialogs.ts) — sempre centrada
 * na tela e por cima de qualquer outro modal, com uma entrada animada. Montado uma vez, perto da raiz do app. */
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
        {pedido.tipo === 'senha' ? (
          <CampoSenha key={pedido.id} pedido={pedido} />
        ) : pedido.tipo === 'arquivar' ? (
          <CamposArquivar key={pedido.id} />
        ) : (
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
        )}
      </div>
    </div>
  )
}

/** Motivo de arquivar a cotação: um da lista (obrigatório) e o detalhe (obrigatório em "Outro"). */
function CamposArquivar() {
  const [motivo, setMotivo] = useState('')
  const [detalhe, setDetalhe] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!motivo) return setErro('Escolha o motivo.')
        if (motivo === 'Outro' && !detalhe.trim()) return setErro('Em "Outro", escreva o motivo.')
        resolverArquivamento({ motivo, detalhe: detalhe.trim() })
      }}
    >
      <div className="space-y-1" role="radiogroup" aria-label="Motivo">
        {MOTIVOS_ARQUIVAMENTO.map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm text-ink-700">
            <input type="radio" name="motivo-arquivamento" value={m} checked={motivo === m} onChange={() => setMotivo(m)} />
            {m}
          </label>
        ))}
      </div>
      <textarea
        className="field-input min-h-[4.5rem] text-sm"
        placeholder={motivo === 'Outro' ? 'Qual foi o motivo?' : 'Detalhe (opcional) — ex.: concorrente fez R$ 120,00'}
        aria-label="Detalhe do motivo"
        value={detalhe}
        onChange={(e) => setDetalhe(e.target.value)}
      />
      {erro && (
        <p role="alert" className="text-sm text-rose-600">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={() => resolverArquivamento(null)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary">
          Arquivar
        </Button>
      </div>
    </form>
  )
}

function CampoSenha({ pedido }: { pedido: Extract<PedidoDialog, { tipo: 'senha' }> }) {
  const [senha, setSenha] = useState('')
  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault()
        resolverPedidoAtual(true, senha)
      }}
    >
      <input
        type="password"
        className="field-input"
        autoFocus
        autoComplete="current-password"
        placeholder="Senha"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
      />
      <div className="mt-5 flex gap-2 justify-end">
        <Button type="button" variant="secondary" onClick={() => resolverPedidoAtual(false)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!senha}>
          {pedido.confirmText}
        </Button>
      </div>
    </form>
  )
}
