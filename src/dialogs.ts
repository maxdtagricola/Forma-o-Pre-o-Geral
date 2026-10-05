import { useSyncExternalStore } from 'react'

// -----------------------------------------------------------------------
// Substitui window.confirm()/alert()/prompt() (de senha) por uma caixa própria, sempre centrada
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
  | {
      tipo: 'arquivar'
      /** Muda a cada pedido — a caixa usa pra começar com os campos vazios. */
      id: number
      mensagem: string
      titulo?: string
      resolver: (valor: { motivo: string; detalhe: string } | null) => void
    }
  | {
      tipo: 'senha'
      /** Muda a cada pedido — a caixa usa pra começar com o campo vazio. */
      id: number
      mensagem: string
      titulo?: string
      confirmText: string
      resolver: (valor: string | null) => void
    }

let pedidoAtual: PedidoDialog | null = null
// pedidos que chegaram com outra caixa aberta — aparecem em seguida, na ordem (antes, um pedido novo
// tomava o lugar do aberto e quem esperava por aquele nunca recebia resposta)
let fila: PedidoDialog[] = []
let ouvintes: Array<() => void> = []
let proximoId = 0

function notificarOuvintes() {
  for (const ouvinte of ouvintes) ouvinte()
}

function abrir(pedido: PedidoDialog) {
  if (pedidoAtual) {
    fila.push(pedido)
    return
  }
  pedidoAtual = pedido
  notificarOuvintes()
}

/** Substitui `confirm('texto')` — mesma ideia (resolve true/false), mas assíncrona e centrada. */
export function confirmar(
  mensagem: string,
  opcoes?: { titulo?: string; confirmText?: string; cancelText?: string; tone?: 'default' | 'danger' },
): Promise<boolean> {
  return new Promise((resolve) => {
    abrir({
      tipo: 'confirmar',
      mensagem,
      titulo: opcoes?.titulo,
      confirmText: opcoes?.confirmText ?? 'Confirmar',
      cancelText: opcoes?.cancelText ?? 'Cancelar',
      tone: opcoes?.tone ?? 'default',
      resolver: resolve,
    })
  })
}

/** Substitui `alert('texto')` — mesma ideia (só avisa e fecha), mas assíncrona e centrada. */
export function avisar(mensagem: string, opcoes?: { titulo?: string; okText?: string }): Promise<void> {
  return new Promise((resolve) => {
    abrir({
      tipo: 'avisar',
      mensagem,
      titulo: opcoes?.titulo,
      okText: opcoes?.okText ?? 'OK',
      resolver: resolve,
    })
  })
}

/** Pede uma senha numa caixa (campo escondido). Resolve com o que foi digitado, ou null se cancelar. */
export function pedirSenha(mensagem: string, opcoes?: { titulo?: string; confirmText?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    abrir({
      tipo: 'senha',
      id: ++proximoId,
      mensagem,
      titulo: opcoes?.titulo,
      confirmText: opcoes?.confirmText ?? 'Confirmar',
      resolver: resolve,
    })
  })
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.push(ouvinte)
  return () => {
    ouvintes = ouvintes.filter((o) => o !== ouvinte)
  }
}

/** Só o <DialogHost/> usa isso, pra saber o que desenhar (ou nada, se não houver pedido pendente).
 * useSyncExternalStore (e não useState + useEffect pra assinar): com o useEffect, um aviso disparado
 * no intervalo entre o DialogHost desenhar e o efeito começar a escutar se perdia — ninguém estava
 * ouvindo ainda, e a caixa nunca aparecia. Aqui o React confere o valor de novo depois de assinar. */
export function usePedidoDialog(): PedidoDialog | null {
  return useSyncExternalStore(assinar, () => pedidoAtual)
}

/** Pede o motivo de arquivar uma cotação (lista de motivos + detalhe). Resolve com a escolha, ou null
 * se cancelar — e aí a cotação não deve ser arquivada. */
export function pedirMotivoArquivamento(mensagem: string): Promise<{ motivo: string; detalhe: string } | null> {
  return new Promise((resolve) => {
    abrir({ tipo: 'arquivar', id: ++proximoId, mensagem, titulo: 'Arquivar cotação', resolver: resolve })
  })
}

/** Só o <DialogHost/> chama isso, na caixa de pedirMotivoArquivamento(). */
export function resolverArquivamento(valor: { motivo: string; detalhe: string } | null) {
  const pedido = pedidoAtual
  pedidoAtual = fila.shift() ?? null
  notificarOuvintes()
  if (pedido?.tipo === 'arquivar') pedido.resolver(valor)
}

/** Só o <DialogHost/> chama isso, ao clicar num botão (ou fechar) da caixa atual. `texto` é a senha
 * digitada, numa caixa de pedirSenha(). */
export function resolverPedidoAtual(valorConfirmar?: boolean, texto?: string) {
  const pedido = pedidoAtual
  pedidoAtual = fila.shift() ?? null
  notificarOuvintes()
  if (!pedido) return
  if (pedido.tipo === 'confirmar') pedido.resolver(valorConfirmar ?? false)
  else if (pedido.tipo === 'senha') pedido.resolver(valorConfirmar ? (texto ?? '') : null)
  else if (pedido.tipo === 'arquivar') pedido.resolver(null)
  else pedido.resolver()
}
