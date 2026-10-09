import { useState } from 'react'
import { Button } from './ui/Basics'
import { resolverArquivamento, resolverPedidoAtual, resolverProducao, usePedidoDialog, type PedidoDialog } from '../dialogs'
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
        ) : pedido.tipo === 'producao' ? (
          <CamposProducao key={pedido.id} pedido={pedido} />
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

/** Produção do pedido confirmado: todo em produção, ou em parte — aí marca quais itens já estão. */
function CamposProducao({ pedido }: { pedido: Extract<PedidoDialog, { tipo: 'producao' }> }) {
  const [tipo, setTipo] = useState<'total' | 'parcial' | ''>(pedido.inicial?.tipo ?? '')
  const [selecionados, setSelecionados] = useState<Set<string>>(
    new Set(pedido.inicial?.tipo === 'parcial' ? pedido.inicial.itemIds : []),
  )
  const [observacao, setObservacao] = useState(pedido.inicial?.observacao ?? '')
  const [previsao, setPrevisao] = useState(pedido.inicial?.previsaoFinalizacao ?? '')
  const [erro, setErro] = useState<string | null>(null)

  function alternar(id: string) {
    setSelecionados((prev) => {
      const proximo = new Set(prev)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!tipo) return setErro('Escolha se o pedido está todo ou só em parte em produção.')
        // a ordem dos itens segue a do pedido, não a dos cliques
        const itemIds = tipo === 'total' ? pedido.itens.map((i) => i.id) : pedido.itens.filter((i) => selecionados.has(i.id)).map((i) => i.id)
        if (tipo === 'parcial' && itemIds.length === 0) return setErro('Marque os itens que já estão em produção.')
        if (previsao && Number(previsao.slice(0, 4)) < 2000) return setErro('Confira o ano da previsão de finalização.')
        resolverProducao({ tipo, itemIds, observacao: observacao.trim(), previsaoFinalizacao: previsao })
      }}
    >
      <div className="space-y-1" role="radiogroup" aria-label="Produção">
        {(
          [
            ['total', 'Todo o pedido em produção'],
            ['parcial', 'Pedido parcialmente em produção'],
          ] as const
        ).map(([valor, rotulo]) => (
          <label key={valor} className="flex items-center gap-2 text-sm text-ink-700">
            <input type="radio" name="producao-pedido" value={valor} checked={tipo === valor} onChange={() => setTipo(valor)} />
            {rotulo}
          </label>
        ))}
      </div>
      {tipo === 'parcial' && (
        <div className="max-h-52 space-y-1 overflow-auto rounded-lg border border-ink-100 p-2" aria-label="Itens em produção">
          <p className="text-xs text-ink-400">Quais itens já estão em produção?</p>
          {pedido.itens.map((item) => (
            <label key={item.id} className="flex items-center gap-2 py-0.5 text-sm text-ink-700">
              <input type="checkbox" checked={selecionados.has(item.id)} onChange={() => alternar(item.id)} />
              {item.rotulo}
            </label>
          ))}
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Previsão de finalização da produção (a que o fornecedor informa)</span>
        {/* não controlado — ver DateField */}
        <input type="date" className="field-input py-1.5 text-sm" defaultValue={previsao} onChange={(e) => setPrevisao(e.target.value)} />
      </label>
      <textarea
        className="field-input min-h-[3.5rem] text-sm"
        placeholder="Observação (opcional) — ex.: o restante entra em produção semana que vem"
        aria-label="Observação da produção"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
      />
      {erro && (
        <p role="alert" className="text-sm text-rose-600">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={() => resolverProducao(null)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary">
          Confirmar
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
