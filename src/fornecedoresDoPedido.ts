import { chaveFornecedorFrete, rotuloRemetente, type RemetenteFrete } from './db/analysesRepo'
import { mercadoriaRecebida } from './avisosEntrega'
import type { QuoteItem, QuoteRecord } from './types'

// -----------------------------------------------------------------------
// Os pedidos de cada fornecedor dentro de um pedido de compra — um pedido
// pode sair fechado com mais de um fornecedor, e cada um tem a sua nota,
// o seu frete, a sua produção e as suas datas.
// -----------------------------------------------------------------------

/** Chave dos dados (transporte, produção) dos itens que ficaram sem fornecedor. */
export const CHAVE_SEM_FORNECEDOR = 'SEM FORNECEDOR'

/** Só os itens que realmente entraram no pedido de compra — uma cotação pode ter sido fechada só com
 * "alguns itens". Cotações antigas, de antes desse controle, não têm pedidoCompra: valem todos. */
export function itensDoPedidoDeCompra(cotacao: Pick<QuoteRecord, 'items' | 'pedidoCompra'>): QuoteItem[] {
  const ids = cotacao.pedidoCompra?.itemIds
  if (!ids) return cotacao.items
  const permitidos = new Set(ids)
  return cotacao.items.filter((item) => permitidos.has(item.id))
}

export interface FornecedorDoPedido {
  /** Fornecedor + UF de origem (o mesmo agrupamento do frete); '' pros itens sem fornecedor. */
  chave: string
  /** Chave dos dados desse pedido (transporte, previsão da produção) — a do grupo, ou "SEM FORNECEDOR". */
  chaveDados: string
  remetente: RemetenteFrete
  fornecedor: string
  /** Nome pra mostrar ("TOLEAGRI", ou "TOLEAGRI — PR" quando o mesmo fornecedor sai de mais de um estado). */
  rotulo: string
  items: QuoteItem[]
}

/** Divide os itens do pedido por fornecedor (+ UF de origem) — o mesmo fornecedor saindo de outro
 * estado também é outro pedido, com outro frete. */
export function fornecedoresDoPedido(cotacao: Pick<QuoteRecord, 'items' | 'pedidoCompra'>): FornecedorDoPedido[] {
  const mapa = new Map<string, { remetente: RemetenteFrete; items: QuoteItem[] }>()
  for (const item of itensDoPedidoDeCompra(cotacao)) {
    const nome = item.product.fornecedor.trim()
    const remetente: RemetenteFrete = nome ? { nome, uf: item.product.estadoOrigem } : { nome: '' }
    const chave = chaveFornecedorFrete(remetente.nome, remetente.uf)
    if (!mapa.has(chave)) mapa.set(chave, { remetente, items: [] })
    mapa.get(chave)!.items.push(item)
  }
  const remetentes = Array.from(mapa.values()).map((g) => g.remetente)
  return Array.from(mapa.entries()).map(([chave, g]) => ({
    chave,
    chaveDados: chave || CHAVE_SEM_FORNECEDOR,
    remetente: g.remetente,
    fornecedor: g.remetente.nome || 'Sem fornecedor definido',
    rotulo: g.remetente.nome ? rotuloRemetente(g.remetente, remetentes) : 'Sem fornecedor definido',
    items: g.items,
  }))
}

/** Uma data do pedido (previsão de produção ou de entrega) e o fornecedor a quem ela se refere. */
export interface PrevisaoDoFornecedor {
  chave: string
  /** Nome do fornecedor — vazio quando o pedido tem um fornecedor só (ou a data vale pro pedido todo). */
  rotulo: string
  /** "AAAA-MM-DD" */
  previsao: string
}

const dataValida = (data: string | undefined): data is string => !!data && /^\d{4}-\d{2}-\d{2}$/.test(data)

/** "TOLEAGRI|PR" (chave de um envio que não bate mais com os itens) → "TOLEAGRI — PR". */
function rotuloDaChave(chave: string): string {
  if (chave === CHAVE_SEM_FORNECEDOR) return 'Sem fornecedor definido'
  const [nome, uf] = chave.split('|')
  return uf ? `${nome} — ${uf}` : nome
}

/** Previsão de finalização da produção de cada fornecedor do pedido, da mais próxima pra mais distante.
 * Pedido com um fornecedor só (ou informado antes da previsão por fornecedor): uma data, sem nome. */
export function previsoesDeProducao(cotacao: Pick<QuoteRecord, 'items' | 'pedidoCompra' | 'producao'>): PrevisaoDoFornecedor[] {
  const producao = cotacao.producao
  if (!producao) return []
  const porFornecedor = producao.previsaoPorFornecedor ?? {}
  const fornecedores = fornecedoresDoPedido(cotacao)
  const lista = fornecedores
    .filter((f) => dataValida(porFornecedor[f.chaveDados]))
    .map((f) => ({ chave: f.chaveDados, rotulo: fornecedores.length > 1 ? f.rotulo : '', previsao: porFornecedor[f.chaveDados] }))
  if (lista.length > 0) return lista.sort((a, b) => a.previsao.localeCompare(b.previsao))
  return dataValida(producao.previsaoFinalizacao) ? [{ chave: '', rotulo: '', previsao: producao.previsaoFinalizacao }] : []
}

/** Previsão de entrega de cada fornecedor que ainda não entregou, da mais próxima (ou atrasada) pra
 * mais distante — pedido já entregue não tem mais previsão. */
export function previsoesDeEntrega(
  cotacao: Pick<QuoteRecord, 'items' | 'pedidoCompra' | 'status' | 'transportePorFornecedor'>,
): PrevisaoDoFornecedor[] {
  if (mercadoriaRecebida(cotacao.status)) return []
  const envios = Object.entries(cotacao.transportePorFornecedor ?? {})
  const fornecedores = fornecedoresDoPedido(cotacao)
  const comNome = fornecedores.length > 1 || envios.length > 1
  return envios
    .filter(([, t]) => !t.entregueEm && dataValida(t.previsaoEntrega))
    .map(([chave, t]) => ({
      chave,
      rotulo: comNome ? fornecedores.find((f) => f.chaveDados === chave)?.rotulo ?? rotuloDaChave(chave) : '',
      previsao: t.previsaoEntrega!,
    }))
    .sort((a, b) => a.previsao.localeCompare(b.previsao))
}
