import type { ProducaoPedido, QuoteItem } from '../types'

/** "Em produção: pedido todo" ou "Em produção: 2 de 5 itens". */
export function textoProducao(producao: ProducaoPedido, totalItens: number): string {
  if (producao.tipo === 'total') return 'Em produção: pedido todo'
  return `Em produção: ${producao.itemIds.length} de ${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`
}

/** Selo da produção do pedido confirmado (verde: todo em produção; âmbar: só parte). */
export function SeloProducao({ producao, totalItens }: { producao: ProducaoPedido; totalItens: number }) {
  const total = producao.tipo === 'total'
  const quando = new Date(producao.em).toLocaleDateString('pt-BR')
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        total ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'
      }`}
      title={`Informado por ${producao.por} em ${quando}${producao.observacao ? ` — ${producao.observacao}` : ''}`}
    >
      <span aria-hidden>{total ? '●' : '◐'}</span>
      {textoProducao(producao, totalItens)}
    </span>
  )
}

/** Detalhe da produção: todo ou parte, quais itens já estão (e quais ainda não), observação, quem e quando. */
export function DetalheProducao({ producao, itens }: { producao: ProducaoPedido; itens: QuoteItem[] }) {
  const emProducao = new Set(producao.itemIds)
  const nome = (item: QuoteItem) => item.product.referencia || item.product.descricao || 'Item sem descrição'
  const faltam = itens.filter((item) => !emProducao.has(item.id))
  return (
    <div className="space-y-0.5">
      <p className="font-medium text-ink-800">{producao.tipo === 'total' ? 'Todo o pedido em produção' : 'Pedido parcialmente em produção'}</p>
      {producao.tipo === 'parcial' && (
        <>
          <p className="text-ink-600">
            <span className="text-emerald-700">Em produção:</span>{' '}
            {itens
              .filter((item) => emProducao.has(item.id))
              .map(nome)
              .join(', ') || '—'}
          </p>
          {faltam.length > 0 && (
            <p className="text-ink-600">
              <span className="text-amber-700">Ainda não:</span> {faltam.map(nome).join(', ')}
            </p>
          )}
        </>
      )}
      {producao.observacao && <p className="text-ink-600">{producao.observacao}</p>}
      <p className="text-[11px] text-ink-400">
        por {producao.por} em {new Date(producao.em).toLocaleDateString('pt-BR')}
      </p>
    </div>
  )
}
