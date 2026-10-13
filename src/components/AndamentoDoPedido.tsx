import { useState } from 'react'
import { dataHora, entradaNoPedidoDeCompra, passosDoStatus } from '../historicoStatus'
import { diasUteisDesde, useVersaoFeriados } from '../diasUteis'
import { corPadraoDoStatus } from '../statusColors'
import type { QuoteRecord } from '../types'

/** "no mesmo dia", "1 dia útil", "3 dias úteis" */
function intervalo(dias: number): string {
  if (dias <= 0) return 'no mesmo dia'
  return dias === 1 ? '1 dia útil' : `${dias} dias úteis`
}

/** Datas do processamento da cotação: quando virou pedido de compra (e quanto depois de enviada ao
 * cliente) e, ao abrir, cada mudança de status — de onde veio, quem mudou, quando e quanto tempo
 * depois da anterior. */
export function AndamentoDoPedido({
  cotacao,
  corDoStatus = corPadraoDoStatus,
}: {
  cotacao: Pick<QuoteRecord, 'statusHistory'>
  corDoStatus?: (status: string) => string
}) {
  useVersaoFeriados()
  const [aberto, setAberto] = useState(false)
  const passos = passosDoStatus(cotacao)
  const pedido = entradaNoPedidoDeCompra(cotacao)
  return (
    <div className="space-y-1.5" aria-label="Andamento do pedido">
      {pedido ? (
        <p className="text-ink-700">
          <span className="font-medium text-ink-900">Virou pedido de compra em {dataHora(pedido.em)}</span>
          {pedido.por && <span className="text-ink-500"> · por {pedido.por}</span>}
          {pedido.enviadaEm !== undefined && (
            <span className="block text-xs text-ink-500">
              {(() => {
                const dias = diasUteisDesde(pedido.enviadaEm, pedido.em)
                const enviada = new Date(pedido.enviadaEm).toLocaleDateString('pt-BR')
                return dias <= 0
                  ? `No mesmo dia em que foi enviada ao cliente (${enviada}).`
                  : `${intervalo(dias)} depois de enviada ao cliente (${enviada}).`
              })()}
            </span>
          )}
        </p>
      ) : (
        <p className="text-ink-500">Ainda não passou para pedido de compra.</p>
      )}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="text-xs font-medium text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline"
      >
        {aberto ? 'Ocultar as mudanças de status' : `Ver todas as mudanças de status (${passos.length})`}
      </button>
      {aberto && (
        <ol className="space-y-1 border-l-2 border-ink-100 pl-3" aria-label="Mudanças de status">
          {passos.map((p, i) => (
            <li key={`${p.em}-${i}`} className="text-xs text-ink-600">
              <span className="flex flex-wrap items-center gap-x-1.5">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: corDoStatus(p.para) }} />
                <strong className="font-semibold text-ink-800">{p.para}</strong>
                {p.de && p.de !== p.para && <span className="text-ink-400">(de {p.de})</span>}
                <span>· {dataHora(p.em)}</span>
                {p.por && <span>· {p.por}</span>}
                {p.diasUteis !== undefined && <span className="text-ink-400">· {intervalo(p.diasUteis)} depois da anterior</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
