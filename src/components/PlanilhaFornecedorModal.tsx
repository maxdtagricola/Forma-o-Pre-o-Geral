import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Basics'
import { abrirParaImpressao, baixarBlob, compartilharArquivo, linkEmail, linkWhatsApp, suportaCompartilharArquivo } from '../planilhaCliente'
import {
  gerarPlanilhaFornecedor,
  nomeArquivoFornecedor,
  workbookFornecedorParaBlob,
  type PlanilhaFornecedorGerada,
} from '../planilhaFornecedor'
import type { QuoteItem } from '../types'

export function PlanilhaFornecedorModal({
  items,
  maquina,
  cliente,
  onClose,
}: {
  items: QuoteItem[]
  maquina: string
  cliente: string
  onClose: () => void
}) {
  const [erro, setErro] = useState<string | undefined>(undefined)
  const [resultado, setResultado] = useState<PlanilhaFornecedorGerada | undefined>(undefined)
  const [compartilhando, setCompartilhando] = useState(false)
  const podeCompartilharArquivo = useMemo(() => suportaCompartilharArquivo(), [])
  const nomeArquivo = useMemo(() => nomeArquivoFornecedor(maquina, cliente), [maquina, cliente])

  useEffect(() => {
    let cancelado = false
    setResultado(undefined)
    setErro(undefined)
    gerarPlanilhaFornecedor(items)
      .then((r) => {
        if (!cancelado) setResultado(r)
      })
      .catch((err) => {
        if (!cancelado) setErro(err instanceof Error ? err.message : 'Erro ao gerar a planilha do fornecedor.')
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const titulo = `Orçamento — ${maquina || cliente || 'itens marcados'}`
  const mensagem = `Segue o orçamento pra cotação (${items.length} item${items.length > 1 ? 's' : ''}${
    maquina ? ` — ${maquina}` : ''
  }). Anexei a planilha "${nomeArquivo}".`

  async function handleBaixar() {
    if (!resultado) return
    const blob = await workbookFornecedorParaBlob(resultado.workbook)
    baixarBlob(blob, nomeArquivo)
  }

  async function handleCompartilhar() {
    if (!resultado) return
    setCompartilhando(true)
    try {
      const blob = await workbookFornecedorParaBlob(resultado.workbook)
      await compartilharArquivo(blob, nomeArquivo, titulo, mensagem)
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
            <h3 className="font-display text-lg font-semibold text-ink-900">Planilha do fornecedor</h3>
            <p className="text-sm text-ink-400">
              {items.length} item{items.length > 1 ? 's' : ''} marcado{items.length > 1 ? 's' : ''} — {nomeArquivo}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
            ×
          </button>
        </div>

        {erro && <p className="text-sm text-rose-600 py-4">{erro}</p>}
        {!erro && !resultado && <p className="text-sm text-ink-400 py-4 text-center">Gerando planilha…</p>}

        {resultado && (
          <>
            <div
              className="planilha-preview flex-1 overflow-auto rounded-xl border border-ink-100 mb-4 mt-2"
              dangerouslySetInnerHTML={{ __html: resultado.htmlPreview }}
            />

            <div className="flex flex-wrap gap-2 mb-3">
              <Button variant="secondary" onClick={handleBaixar}>
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
