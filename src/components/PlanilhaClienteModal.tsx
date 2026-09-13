import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Basics'
import {
  abrirParaImpressao,
  baixarWorkbook,
  compartilharArquivo,
  gerarPlanilhaAtualizada,
  linkEmail,
  linkWhatsApp,
  suportaCompartilharArquivo,
  workbookParaBlob,
  type PlanilhaAtualizada,
} from '../planilhaCliente'
import type { QuoteItem } from '../types'

export function PlanilhaClienteModal({
  nomeArquivo,
  conteudoBase64,
  items,
  cliente,
  maquina,
  onClose,
}: {
  nomeArquivo: string
  conteudoBase64: string
  items: QuoteItem[]
  cliente: string
  maquina: string
  onClose: () => void
}) {
  const [erro, setErro] = useState<string | undefined>(undefined)
  const [resultado, setResultado] = useState<PlanilhaAtualizada | undefined>(undefined)
  const [compartilhando, setCompartilhando] = useState(false)
  const podeCompartilharArquivo = useMemo(() => suportaCompartilharArquivo(), [])

  useEffect(() => {
    try {
      setResultado(gerarPlanilhaAtualizada(conteudoBase64, items))
      setErro(undefined)
    } catch (err) {
      setResultado(undefined)
      setErro(err instanceof Error ? err.message : 'Erro ao ler a planilha original.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteudoBase64, items])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const titulo = `Orçamento — ${cliente || 'cliente'} — ${maquina || 'máquina'}`
  const mensagem = `Segue o orçamento atualizado (${cliente || 'cliente'} — ${maquina || 'máquina'}). Anexei a planilha "${nomeArquivo}".`

  async function handleCompartilhar() {
    if (!resultado) return
    setCompartilhando(true)
    try {
      await compartilharArquivo(workbookParaBlob(resultado.workbook), nomeArquivo, titulo, mensagem)
    } catch {
      // usuário cancelou o compartilhamento — não é um erro real
    } finally {
      setCompartilhando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900">Planilha do cliente</h3>
            <p className="text-sm text-ink-400">{nomeArquivo}</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
            ×
          </button>
        </div>

        {erro && <p className="text-sm text-rose-600 py-4">{erro}</p>}

        {resultado && (
          <>
            <p className="text-xs text-ink-400 my-2">
              {resultado.itensAtualizados > 0
                ? `${resultado.itensAtualizados} item(ns) atualizado(s) com valor e prazo.`
                : 'Nenhum item da cotação bateu com a Referência de alguma linha dessa planilha.'}
            </p>

            <div
              className="planilha-preview flex-1 overflow-auto rounded-xl border border-ink-100 mb-4"
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
              <p className="field-label mb-2">Encaminhar</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={linkWhatsApp(mensagem)}
                  target="_blank"
                  rel="noreferrer"
                  className="pill-tab border border-ink-200 text-ink-600 hover:bg-ink-50"
                >
                  WhatsApp
                </a>
                <a
                  href={linkEmail(titulo, mensagem)}
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
          </>
        )}
      </div>
    </div>
  )
}
