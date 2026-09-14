import { Button } from './ui/Basics'
import type { PreviaPlanilha } from '../xlsxSheetUtil'

/** Gate de "é essa mesmo?" — mostra a planilha bruta antes de deixar seguir com a importação. */
export function PreviaImportacao({
  nomeArquivo,
  previa,
  onConfirmar,
  onCancelar,
  confirmando,
}: {
  nomeArquivo: string
  previa: PreviaPlanilha
  onConfirmar: () => void
  onCancelar: () => void
  confirmando?: boolean
}) {
  return (
    <div className="rounded-xl border border-ink-100 p-4 space-y-3">
      <div>
        <p className="font-medium text-ink-900">{nomeArquivo}</p>
        <p className="text-xs text-ink-400">
          Aba "{previa.nomeAba}"
          {previa.totalLinhas > previa.linhasMostradas
            ? ` — mostrando as ${previa.linhasMostradas} primeiras linhas de ${previa.totalLinhas}`
            : ''}
          . Confira se é a planilha certa antes de continuar.
        </p>
      </div>
      <div
        className="planilha-preview max-h-72 overflow-auto rounded-lg border border-ink-100"
        dangerouslySetInnerHTML={{ __html: previa.htmlPreview }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancelar}>
          Não é essa — trocar arquivo
        </Button>
        <Button variant="primary" onClick={onConfirmar} disabled={confirmando}>
          Sim, é essa mesmo
        </Button>
      </div>
    </div>
  )
}
