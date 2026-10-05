import { lazy, Suspense } from 'react'

const ChessBoard3D = lazy(() =>
  import('../components/ChessBoard3D').then((m) => ({ default: m.ChessBoard3D })),
)

/** Aba Xadrez — o tabuleiro, que antes ficava na Tela Inicial. */
export function XadrezPage({ jogador }: { jogador: string }) {
  return (
    <div className="card">
      <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Xadrez</h2>
      <Suspense fallback={<p className="text-sm text-ink-400 text-center py-10">Carregando o tabuleiro…</p>}>
        <ChessBoard3D jogador={jogador} />
      </Suspense>
    </div>
  )
}
