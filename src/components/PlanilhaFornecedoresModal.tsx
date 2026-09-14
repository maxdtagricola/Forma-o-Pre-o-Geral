import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Basics'
import {
  abrirParaImpressao,
  baixarWorkbook,
  compartilharArquivo,
  linkEmail,
  linkWhatsApp,
  suportaCompartilharArquivo,
  workbookParaBlob,
} from '../planilhaCliente'
import { gerarPlanilhaFornecedores } from '../planilhaFornecedores'
import type { PreRegistroItem } from '../types'

export function PlanilhaFornecedoresModal({
  itens,
  cliente,
  maquina,
  onClose,
  onEncaminhado,
}: {
  itens: PreRegistroItem[]
  cliente: string
  maquina: string
  onClose: () => void
  onEncaminhado: () => void
}) {
  const [compartilhando, setCompartilhando] = useState(false)
  const podeCompartilharArquivo = useMemo(() => suportaCompartilharArquivo(), [])
  const resultado = useMemo(() => gerarPlanilhaFornecedores(itens), [itens])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const nomeArquivo = `itens-para-cotar-${(cliente || 'cliente').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`
  const titulo = `Itens para cotar — ${cliente || 'cliente'} — ${maquina || 'máquina'}`
  const mensagem = `Segue a lista de itens pra cotação (${cliente || 'cliente'} — ${maquina || 'máquina'}). Poderia preencher valor unitário e prazo de entrega e devolver?`

  async function handleCompartilhar() {
    setCompartilhando(true)
    try {
      await compartilharArquivo(workbookParaBlob(resultado.workbook), nomeArquivo, titulo, mensagem)
      onEncaminhado()
    } catch {
      // usuário cancelou o compartilhamento — não é um erro real, não marca como encaminhado
    } finally {
      setCompartilhando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900">Planilha para fornecedores</h3>
            <p className="text-sm text-ink-400">
              Referência, Descrição e Quantidade dos itens a cotar — Valor unitário e Prazo ficam em branco pro
              fornecedor preencher.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
            ×
          </button>
        </div>

        <div
          className="planilha-preview flex-1 overflow-auto rounded-xl border border-ink-100 my-4"
          dangerouslySetInnerHTML={{ __html: resultado.htmlPreview }}
        />

        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="secondary" onClick={() => baixarWorkbook(resultado.workbook, nomeArquivo)}>
            Baixar planilha (.xlsx)
          </Button>
          <Button variant="secondary" onClick={() => abrirParaImpressao(resultado.htmlPreview, titulo)}>
            Imprimir / Salvar como PDF
          </Button>
          {podeCompartilharArquivo && (
            <Button variant="secondary" onClick={handleCompartilhar} disabled={compartilhando}>
              Compartilhar arquivo…
            </Button>
          )}
        </div>

        <div className="border-t border-ink-100 pt-3">
          <p className="field-label mb-1">Encaminhar aos fornecedores</p>
          <p className="text-[11px] text-ink-400 mb-2">
            Ao encaminhar, o status da cotação muda pra "AGUARDANDO FORNECEDOR".
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={linkWhatsApp(mensagem)}
              target="_blank"
              rel="noreferrer"
              onClick={onEncaminhado}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              Encaminhar por WhatsApp
            </a>
            <a
              href={linkEmail(titulo, mensagem)}
              onClick={onEncaminhado}
              className="pill-tab border border-ink-200 text-ink-600 hover:bg-ink-50"
            >
              E-mail
            </a>
          </div>
          {!podeCompartilharArquivo && (
            <p className="text-[11px] text-ink-400 mt-2">
              O navegador não anexa o arquivo automaticamente nesses links — baixe a planilha (ou o PDF) acima e
              anexe manualmente.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
