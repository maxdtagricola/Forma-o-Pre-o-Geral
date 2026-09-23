import { useEffect, useState } from 'react'

// -----------------------------------------------------------------------
// Substitui window.confirm()/alert() por uma caixa própria, sempre centrada
// na tela (os diálogos nativos do navegador, em vários celulares, aparecem
// colados no topo — parecendo um popup de propaganda). A API imita a
// original (confirmar() resolve true/false, avisar() resolve quando
// fechado) pra trocar as chamadas existentes sem reescrever a lógica em
// volta — só passa a ser assíncrona.
//
// Guardado fora do React (variável de módulo + lista de ouvintes) porque
// boa parte das chamadas de confirm()/alert() no app de hoje acontece em
// funções soltas (repositórios, handlers), não só dentro de componentes.
// O <DialogHost/> (montado uma vez, perto da raiz) é o único lugar que
// realmente renderiza a caixa.
// -----------------------------------------------------------------------

export type PedidoDialog =
  | {
      tipo: 'confirmar'
      mensagem: string
      titulo?: string
      confirmText: string
      cancelText: string
      tone: 'default' | 'danger'
      resolver: (valor: boolean) => void
    }
  | {
      tipo: 'avisar'
      mensagem: string
      titulo?: string
      okText: string
      resolver: () => void
    }

let pedidoAtual: PedidoDialog | null = null
let ouvintes: Array<() => void> = []

function notificarOuvintes() {
  for (const ouvinte of ouvintes) ouvinte()
}

/** Substitui `confirm('texto')` — mesma ideia (resolve true/false), mas assíncrona e centrada. */
export function confirmar(
  mensagem: string,
  opcoes?: { titulo?: string; confirmText?: string; cancelText?: string; tone?: 'default' | 'danger' },
): Promise<boolean> {
  return new Promise((resolve) => {
    pedidoAtual = {
      tipo: 'confirmar',
      mensagem,
      titulo: opcoes?.titulo,
      confirmText: opcoes?.confirmText ?? 'Confirmar',
      cancelText: opcoes?.cancelText ?? 'Cancelar',
      tone: opcoes?.tone ?? 'default',
      resolver: resolve,
    }
    notificarOuvintes()
  })
}

/** Substitui `alert('texto')` — mesma ideia (só avisa e fecha), mas assíncrona e centrada. */
export function avisar(mensagem: string, opcoes?: { titulo?: string; okText?: string }): Promise<void> {
  return new Promise((resolve) => {
    pedidoAtual = {
      tipo: 'avisar',
      mensagem,
      titulo: opcoes?.titulo,
      okText: opcoes?.okText ?? 'OK',
      resolver: resolve,
    }
    notificarOuvintes()
  })
}

/** Só o <DialogHost/> usa isso, pra saber o que desenhar (ou nada, se não houver pedido pendente). */
export function usePedidoDialog(): PedidoDialog | null {
  const [, forcarAtualizacao] = useState(0)
  useEffect(() => {
    const ouvinte = () => forcarAtualizacao((n) => n + 1)
    ouvintes.push(ouvinte)
    return () => {
      ouvintes = ouvintes.filter((o) => o !== ouvinte)
    }
  }, [])
  return pedidoAtual
}

/** Só o <DialogHost/> chama isso, ao clicar num botão (ou fechar) da caixa atual. */
export function resolverPedidoAtual(valorConfirmar?: boolean) {
  const pedido = pedidoAtual
  pedidoAtual = null
  notificarOuvintes()
  if (!pedido) return
  if (pedido.tipo === 'confirmar') pedido.resolver(valorConfirmar ?? false)
  else pedido.resolver()
}
