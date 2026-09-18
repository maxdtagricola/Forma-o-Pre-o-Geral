import { useMemo } from 'react'
import { calculateItem } from '../calc/calculator'
import { formatCurrency } from '../utils'
import type { QuoteItem } from '../types'

/** Resumo de frete e valor de cada item da cotação — ocupa o lugar de "Dados do produto", que foi
 * removido: em vez de mostrar/editar os campos de um item por vez, mostra de uma vez só o que
 * cada produto custa (frete por unidade e total, valor em preço de compra e em custo final já com
 * impostos). Só leitura — a edição continua na tabela de Itens da cotação. */
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
          custo: result.custoFinalTotal,
        }
      }),
    [items],
  )

  const totais = linhas.reduce(
    (acc, l) => ({
      freteTotal: acc.freteTotal + l.freteTotal,
      valorCompra: acc.valorCompra + l.valorCompra,
      custo: acc.custo + l.custo,
    }),
    { freteTotal: 0, valorCompra: 0, custo: 0 },
  )

  return (
    <div className="card">
      <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Valores dos produtos</h2>
      <p className="text-sm text-ink-400 mb-4">
        Frete e valor de cada item da cotação, em preço de compra e em custo final.
      </p>
      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-ink-50 text-left text-ink-400">
              <th className="py-2 px-3 font-medium">Produto</th>
              <th className="py-2 px-3 font-medium text-right">Frete unitário</th>
              <th className="py-2 px-3 font-medium text-right">Frete total</th>
              <th className="py-2 px-3 font-medium text-right">Valor de compra</th>
              <th className="py-2 px-3 font-medium text-right">Custo</th>
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
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-800">{formatCurrency(l.custo)}</td>
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
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-900">
                  {formatCurrency(totais.custo)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
