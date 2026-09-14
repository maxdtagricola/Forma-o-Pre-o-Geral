import { Button } from './ui/Basics'
import { formatDate } from '../utils'
import type { RascunhoCotacao } from '../rascunhoCotacao'

export function RecuperarRascunhoModal({
  rascunho,
  onRecuperar,
  onDescartar,
}: {
  rascunho: RascunhoCotacao
  onRecuperar: () => void
  onDescartar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-w-md w-full">
        <h3 className="font-display text-lg font-semibold text-ink-900 mb-1">Cotação não salva encontrada</h3>
        <p className="text-sm text-ink-400 mb-4">
          Parece que a página fechou, travou ou faltou energia enquanto você editava
          {rascunho.codigo ? ` a cotação ${rascunho.codigo}` : ' uma cotação'}
          {rascunho.cliente ? ` (${rascunho.cliente})` : ''} — última alteração salva em{' '}
          {formatDate(rascunho.salvoEm)}. Quer continuar de onde parou?
        </p>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={onRecuperar}>
            Recuperar
          </Button>
          <Button variant="secondary" onClick={onDescartar}>
            Descartar
          </Button>
        </div>
      </div>
    </div>
  )
}
