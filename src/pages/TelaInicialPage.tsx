import { lazy, Suspense } from 'react'

const ChessBoard3D = lazy(() =>
  import('../components/ChessBoard3D').then((m) => ({ default: m.ChessBoard3D })),
)

export function TelaInicialPage({ jogador }: { jogador: string }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900">Tela Inicial</h2>
      </div>

      <div className="card">
        <h3 className="font-display text-base font-semibold text-ink-900 mb-4">Xadrez</h3>
        <Suspense fallback={<p className="text-sm text-ink-400 text-center py-10">Carregando o tabuleiro…</p>}>
          <ChessBoard3D jogador={jogador} />
        </Suspense>
      </div>
    </div>
  )
}
