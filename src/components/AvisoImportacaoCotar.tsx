import { Button } from './ui/Basics'

/** Lembrete que aparece ao entrar no modo "Importar planilha" — como identificar os itens a cotar na planilha. */
export function AvisoImportacaoCotar({ onFechar }: { onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold text-ink-900 mb-1">Antes de importar</h3>
        <p className="text-sm text-ink-600 mb-3">
          O sistema só identifica como "item a cotar" a linha que estiver com a célula de <strong>entrega em branco</strong> e
          que tiver, em alguma célula dela, a palavra <strong>"COTAR"</strong> (maiúscula ou minúscula).
        </p>
        <p className="text-sm text-ink-600 mb-4">
          Confira se a planilha do cliente está marcada assim antes de importar — itens sem essa marcação não vão
          aparecer na lista de itens a cotar.
        </p>
        <Button variant="primary" onClick={onFechar} className="w-full justify-center">
          Entendi
        </Button>
      </div>
    </div>
  )
}
