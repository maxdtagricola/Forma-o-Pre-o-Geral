import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Basics'
import { abrirParaImpressao, baixarBlob, compartilharArquivo, linkEmail, linkWhatsApp, suportaCompartilharArquivo } from '../planilhaCliente'
import { workbookParaBlobXlsx } from '../exceljsHtmlPreview'
import { gerarPedidoCompra, nomeArquivoPedidoCompra, type DadosPedidoCompra, type PedidoCompraGerado } from '../planilhaPedidoCompra'

export function PedidoCompraFornecedorModal({
  dados,
  onClose,
}: {
  dados: DadosPedidoCompra
  onClose: () => void
}) {
  const [erro, setErro] = useState<string | undefined>(undefined)
  const [resultado, setResultado] = useState<PedidoCompraGerado | undefined>(undefined)
  const [compartilhando, setCompartilhando] = useState(false)
  const podeCompartilharArquivo = useMemo(() => suportaCompartilharArquivo(), [])
  const nomeArquivo = useMemo(() => nomeArquivoPedidoCompra(dados.fornecedor), [dados.fornecedor])

  useEffect(() => {
    let cancelado = false
    setResultado(undefined)
    setErro(undefined)
    gerarPedidoCompra(dados)
      .then((r) => {
        if (!cancelado) setResultado(r)
      })
      .catch((err) => {
        if (!cancelado) setErro(err instanceof Error ? err.message : 'Erro ao gerar o pedido de compra.')
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const titulo = `Pedido de compra — ${dados.fornecedor} — ${dados.codigoCotacao}`
  const mensagem = `Segue o pedido de compra ${dados.codigoCotacao} (${dados.itens.length} item${
    dados.itens.length > 1 ? 's' : ''
  }) pra ${dados.fornecedor}. Anexei a planilha "${nomeArquivo}".`

  async function handleBaixar() {
    if (!resultado) return
    const blob = await workbookParaBlobXlsx(resultado.workbook)
    baixarBlob(blob, nomeArquivo)
  }

  async function handleCompartilhar() {
    if (!resultado) return
    setCompartilhando(true)
    try {
      const blob = await workbookParaBlobXlsx(resultado.workbook)
      await compartilharArquivo(blob, nomeArquivo, titulo, mensagem)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      alert('Não consegui compartilhar o arquivo direto — baixe a planilha acima e anexe manualmente.')
    } finally {
      setCompartilhando(false)
    }
  }

  async function handleWhatsApp() {
    if (podeCompartilharArquivo && resultado) {
      setCompartilhando(true)
      try {
        const blob = await workbookParaBlobXlsx(resultado.workbook)
        await compartilharArquivo(blob, nomeArquivo, titulo, mensagem)
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
      } finally {
        setCompartilhando(false)
      }
    }
    window.open(linkWhatsApp(mensagem), '_blank', 'noopener')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900">Pedido de compra — {dados.fornecedor}</h3>
            <p className="text-sm text-ink-400">
              {dados.itens.length} item{dados.itens.length > 1 ? 's' : ''} — {nomeArquivo}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
            ×
          </button>
        </div>

        {erro && <p className="text-sm text-rose-600 py-4">{erro}</p>}
        {!erro && !resultado && <p className="text-sm text-ink-400 py-4 text-center">Gerando pedido…</p>}

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
                <button
                  type="button"
                  onClick={handleWhatsApp}
                  disabled={compartilhando}
                  className="pill-tab border border-ink-200 text-ink-600 hover:bg-ink-50 disabled:opacity-50"
                >
                  WhatsApp{podeCompartilharArquivo ? ' (com a planilha anexada)' : ''}
                </button>
                <a
                  href={linkEmail(titulo, mensagem)}
                  className="pill-tab border border-ink-200 text-ink-600 hover:bg-ink-50"
                >
                  E-mail
                </a>
              </div>
              {!podeCompartilharArquivo && (
                <p className="text-[11px] text-ink-400 mt-2">
                  Esse navegador não anexa o arquivo automaticamente — o WhatsApp abre só com o texto. Baixe a
                  planilha (ou o PDF) acima e anexe manualmente.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
