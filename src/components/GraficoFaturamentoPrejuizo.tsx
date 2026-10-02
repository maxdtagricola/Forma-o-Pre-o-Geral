import { useState } from 'react'
import { formatCurrency } from '../utils'
import { COR_FATURADO, COR_PREJUIZO } from '../notasFiscaisHelpers'

// -----------------------------------------------------------------------
// Faturamento × prejuízo das transferências, mês a mês: barras divergentes
// a partir de uma linha de base — o que foi faturado sobe, o que ficou
// parado no estoque (prejuízo) desce. Uma escala só pros dois lados (é a
// mesma grandeza, R$), então a altura de uma barra compara direto com a do
// outro lado. Detalhe do mês ao passar o mouse (ou tocar) e, embaixo, a
// tabela com os números exatos.
// -----------------------------------------------------------------------

export interface MesFaturamentoPrejuizo {
  mesKey: string
  rotulo: string
  faturado: number
  parado: number
  freteParado: number
  semResultado: number
}

function compacto(v: number): string {
  if (Math.abs(v) < 1000) return formatCurrency(v)
  if (Math.abs(v) < 1_000_000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
}

function aproveitamento(faturado: number, parado: number): string {
  const base = faturado + parado
  return base > 0 ? `${Math.round((faturado / base) * 100)}%` : '—'
}

const ALTURA_LADO = 112

export function GraficoFaturamentoPrejuizo({ meses }: { meses: MesFaturamentoPrejuizo[] }) {
  const [focado, setFocado] = useState<string | null>(null)
  const semDados = meses.length === 0 || meses.every((m) => m.faturado === 0 && m.parado === 0)
  if (semDados) {
    return (
      <p className="text-sm text-ink-400 text-center py-8">
        Nenhuma transferência marcada como faturada ou parada no estoque ainda — marque em Transferências Fiscais (na nota
        ou em cada produto).
      </p>
    )
  }
  const maximo = Math.max(1, ...meses.flatMap((m) => [m.faturado, m.parado]))

  return (
    <div>
      {/* legenda: sempre à vista (duas séries), com o lado de cada uma — cor nunca sozinha */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COR_FATURADO }} />
          Faturado (acima da linha)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COR_PREJUIZO }} />
          Parado no estoque — prejuízo (abaixo da linha)
        </span>
      </div>

      <div className="relative flex gap-2 sm:gap-3 px-1" role="img" aria-label="Faturado e parado no estoque por mês">
        {/* escala: o valor máximo nas duas pontas, discreto */}
        <div className="flex w-14 shrink-0 flex-col justify-between text-[10px] text-ink-400 tabular-nums" aria-hidden>
          <span style={{ height: ALTURA_LADO }}>{compacto(maximo)}</span>
          <span className="flex items-end" style={{ height: ALTURA_LADO }}>
            {compacto(maximo)}
          </span>
        </div>
        {meses.map((m) => {
          const ativo = focado === m.mesKey
          const hFat = m.faturado > 0 ? Math.max(2, (m.faturado / maximo) * ALTURA_LADO) : 0
          const hPar = m.parado > 0 ? Math.max(2, (m.parado / maximo) * ALTURA_LADO) : 0
          return (
            <div
              key={m.mesKey}
              className="relative flex-1 min-w-0"
              onMouseEnter={() => setFocado(m.mesKey)}
              onMouseLeave={() => setFocado((atual) => (atual === m.mesKey ? null : atual))}
              onClick={() => setFocado((atual) => (atual === m.mesKey ? null : m.mesKey))}
            >
              {/* área de toque maior que a barra: a coluna inteira */}
              <div className={`rounded-md transition ${ativo ? 'bg-ink-100' : ''}`}>
                <div className="flex items-end justify-center" style={{ height: ALTURA_LADO }}>
                  <div
                    className="w-1/2 max-w-[36px] rounded-t"
                    style={{ height: hFat, backgroundColor: COR_FATURADO }}
                  />
                </div>
                <div className="h-px bg-ink-300" />
                <div className="flex items-start justify-center" style={{ height: ALTURA_LADO }}>
                  <div
                    className="w-1/2 max-w-[36px] rounded-b"
                    style={{ height: hPar, backgroundColor: COR_PREJUIZO }}
                  />
                </div>
              </div>
              <p className={`mt-1 truncate text-center text-[10px] ${ativo ? 'font-semibold text-ink-900' : 'text-ink-400'}`}>
                {m.rotulo}
              </p>
              {ativo && (
                <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-52 -translate-x-1/2 rounded-lg border border-ink-200 bg-surface p-2.5 text-xs shadow-lg">
                  <p className="mb-1 font-semibold text-ink-900">{m.rotulo}</p>
                  <p className="flex justify-between gap-2 text-ink-600">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: COR_FATURADO }} />
                      Faturado
                    </span>
                    <span className="font-mono tabular-nums text-ink-900">{formatCurrency(m.faturado)}</span>
                  </p>
                  <p className="flex justify-between gap-2 text-ink-600">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: COR_PREJUIZO }} />
                      Parado (prejuízo)
                    </span>
                    <span className="font-mono tabular-nums text-ink-900">{formatCurrency(m.parado)}</span>
                  </p>
                  <p className="flex justify-between gap-2 text-ink-500">
                    <span>Frete dos parados</span>
                    <span className="font-mono tabular-nums">{formatCurrency(m.freteParado)}</span>
                  </p>
                  <p className="mt-1 flex justify-between gap-2 border-t border-ink-100 pt-1 text-ink-600">
                    <span>Virou venda</span>
                    <span className="font-semibold text-ink-900">{aproveitamento(m.faturado, m.parado)}</span>
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* os números exatos de cada mês */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-ink-100">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-ink-50 text-left text-ink-400">
              <th className="px-2 py-1.5 font-medium">Mês</th>
              <th className="px-2 py-1.5 font-medium text-right">Faturado</th>
              <th className="px-2 py-1.5 font-medium text-right">Parado no estoque</th>
              <th className="px-2 py-1.5 font-medium text-right">Frete dos parados</th>
              <th className="px-2 py-1.5 font-medium text-right">Sem resultado</th>
              <th className="px-2 py-1.5 font-medium text-right">Virou venda</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mesKey} className="border-t border-ink-100">
                <td className="px-2 py-1.5 text-ink-700">{m.rotulo}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-900">{formatCurrency(m.faturado)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-900">{formatCurrency(m.parado)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-600">{formatCurrency(m.freteParado)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-400">{formatCurrency(m.semResultado)}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-ink-800">{aproveitamento(m.faturado, m.parado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
