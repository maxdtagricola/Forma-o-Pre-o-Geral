import { useMemo } from 'react'
import { calculateItem } from '../calc/calculator'
import { formatCurrency } from '../utils'
import type { QuoteItem } from '../types'

/** Resumo de frete e valor de cada item da cotação — ocupa o lugar de "Dados do produto", que foi
 * removido: em vez de mostrar/editar os campos de um item por vez, mostra de uma vez só o que
 * cada produto custa (frete por unidade e total, valor em preço de compra, custo — já com impostos
 * — e preço de venda, cada um unitário e total). Só leitura — a edição continua na tabela de Itens
 * da cotação. */
export function ProductValuesTable({ items }: { items: QuoteItem[] }) {
  const linhas = useMemo(
    () =>
      items.map((item) => {
        const result = calculateItem(item.product, item.pricing)
        const qtd = item.product.qtd || 0
        return {
          id: item.id,
          nome: item.product.descricao || item.product.referencia || 'Item sem descrição',
          freteUnitario: qtd > 0 ? result.freteCalculado / qtd : 0,
          freteTotal: result.freteCalculado,
          valorCompra: result.vlrProduto,
          custoUnitario: result.custoUnitario,
          custoTotal: result.custoFinalTotal,
          vendaUnitario: result.precoVendaUnitario,
          vendaTotal: result.precoVendaTotal,
        }
      }),
    [items],
  )

  const totais = linhas.reduce(
    (acc, l) => ({
      freteTotal: acc.freteTotal + l.freteTotal,
      valorCompra: acc.valorCompra + l.valorCompra,
      custoTotal: acc.custoTotal + l.custoTotal,
      vendaTotal: acc.vendaTotal + l.vendaTotal,
    }),
    { freteTotal: 0, valorCompra: 0, custoTotal: 0, vendaTotal: 0 },
  )

  return (
    <div className="card">
      <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Valores dos produtos</h2>
      <p className="text-sm text-ink-400 mb-4">
        Frete, valor de compra, custo e preço de venda de cada item da cotação — unitário e total.
      </p>
      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-ink-50 text-left text-ink-400">
              <th className="py-2 px-3 font-medium">Produto</th>
              <th className="py-2 px-3 font-medium text-right">Frete unitário</th>
              <th className="py-2 px-3 font-medium text-right">Frete total</th>
              <th className="py-2 px-3 font-medium text-right">Valor de compra</th>
              <th className="py-2 px-3 font-medium text-right">Custo unitário</th>
              <th className="py-2 px-3 font-medium text-right">Custo total</th>
              <th className="py-2 px-3 font-medium text-right">Valor unitário de venda</th>
              <th className="py-2 px-3 font-medium text-right">Valor total de venda</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-t border-ink-100">
                <td className="py-2 px-3 text-ink-800 max-w-[16rem] truncate">{l.nome}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-600">
                  {formatCurrency(l.freteUnitario)}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-600">
                  {formatCurrency(l.freteTotal)}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-600">
                  {formatCurrency(l.valorCompra)}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-600">
                  {formatCurrency(l.custoUnitario)}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-800">
                  {formatCurrency(l.custoTotal)}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-600">
                  {formatCurrency(l.vendaUnitario)}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-800 font-semibold">
                  {formatCurrency(l.vendaTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-ink-200 font-semibold">
                <td className="py-2 px-3 text-ink-900">Total</td>
                <td className="py-2 px-3" />
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-900">
                  {formatCurrency(totais.freteTotal)}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-900">
                  {formatCurrency(totais.valorCompra)}
                </td>
                <td className="py-2 px-3" />
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-900">
                  {formatCurrency(totais.custoTotal)}
                </td>
                <td className="py-2 px-3" />
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-900">
                  {formatCurrency(totais.vendaTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
