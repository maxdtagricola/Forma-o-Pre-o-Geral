import { lazy, Suspense } from 'react'

const ChessBoard3D = lazy(() =>
  import('../components/ChessBoard3D').then((m) => ({ default: m.ChessBoard3D })),
)

export function TelaInicialPage({ jogador }: { jogador: string }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Tela Inicial</h2>
        <p className="text-sm text-ink-400">Bem-vindo. Arraste pra girar o tabuleiro e role o mouse (ou pince) pra aproximar.</p>
      </div>

      <div className="card">
        <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Xadrez</h3>
        <p className="text-xs text-ink-400 mb-4">
          Clique numa peça sua pra ver os movimentos possíveis, depois clique na casa de destino.
        </p>
        <Suspense fallback={<p className="text-sm text-ink-400 text-center py-10">Carregando o tabuleiro…</p>}>
          <ChessBoard3D jogador={jogador} />
        </Suspense>
      </div>
    </div>
  )
}
