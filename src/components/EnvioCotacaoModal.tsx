import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Basics'
import { baixarBlob, compartilharArquivo, linkEmail, suportaCompartilharArquivo } from '../planilhaCliente'
import { gerarPdfCotacaoCliente } from '../cotacaoParaCliente'
import { calculateItem } from '../calc/calculator'
import { formatCurrency } from '../utils'
import type { QuoteItem } from '../types'

const MIME_PDF = 'application/pdf'

export function EnvioCotacaoModal({
  items,
  cliente,
  maquina,
  codigo,
  onClose,
  onEnviado,
}: {
  items: QuoteItem[]
  cliente: string
  maquina: string
  codigo: string
  onClose: () => void
  onEnviado: () => void
}) {
  const [enviando, setEnviando] = useState(false)
  const podeCompartilharArquivo = useMemo(() => suportaCompartilharArquivo(MIME_PDF), [])

  const linhas = useMemo(
    () => items.map((item) => ({ item, resultado: calculateItem(item.product, item.pricing) })),
    [items],
  )
  const valorTotalGeral = useMemo(() => linhas.reduce((s, l) => s + l.resultado.precoVendaTotal, 0), [linhas])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const nomeArquivo = `cotacao-${(cliente || 'cliente').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`
  const titulo = `Cotação — ${cliente || 'cliente'} — ${maquina || 'máquina'}`
  const mensagem = `Segue a cotação (${cliente || 'cliente'} — ${maquina || 'máquina'}).`

  function gerarPdf(): Blob {
    return gerarPdfCotacaoCliente(items, cliente, maquina, codigo)
  }

  function handleBaixarPdf() {
    baixarBlob(gerarPdf(), nomeArquivo)
  }

  async function handleCompartilhar() {
    setEnviando(true)
    try {
      await compartilharArquivo(gerarPdf(), nomeArquivo, titulo, mensagem, MIME_PDF)
      onEnviado()
    } catch {
      // usuário cancelou o compartilhamento — não é um erro real, não marca como enviado
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900">Enviar cotação</h3>
            <p className="text-sm text-ink-400">
              Referência, Descrição, Qtd, Prazo e Valor total já calculados — a proposta em si. Sai em PDF pra baixar
              ou compartilhar com o cliente.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto rounded-xl border border-ink-100 my-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-ink-50 text-left text-ink-400">
                <th className="py-2 px-2 font-medium">Referência</th>
                <th className="py-2 px-2 font-medium">Descrição</th>
                <th className="py-2 px-2 font-medium text-right">Qtd</th>
                <th className="py-2 px-2 font-medium">Prazo</th>
                <th className="py-2 px-2 font-medium text-right">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ item, resultado }) => (
                <tr key={item.id} className="border-t border-ink-100">
                  <td className="py-1.5 px-2 font-mono">{item.product.referencia || '—'}</td>
                  <td className="py-1.5 px-2">{item.product.descricao || '—'}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{item.product.qtd}</td>
                  <td className="py-1.5 px-2">{item.product.prazoEntrega || '—'}</td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                    {formatCurrency(resultado.precoVendaTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-200 bg-ink-50 font-semibold">
                <td className="py-1.5 px-2" colSpan={4}>
                  Total geral
                </td>
                <td className="py-1.5 px-2 text-right font-mono tabular-nums">{formatCurrency(valorTotalGeral)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="border-t border-ink-100 pt-3">
          <p className="field-label mb-1">Enviar ao cliente</p>
          <p className="text-[11px] text-ink-400 mb-2">Ao enviar, o status da cotação muda pra "ENVIADO".</p>
          <div className="flex flex-wrap gap-2">
            {podeCompartilharArquivo && (
              <Button variant="primary" onClick={handleCompartilhar} disabled={enviando}>
                Compartilhar com cliente
              </Button>
            )}
            <Button variant="secondary" onClick={handleBaixarPdf}>
              Baixar PDF
            </Button>
            <a
              href={linkEmail(titulo, mensagem)}
              onClick={onEnviado}
              className="pill-tab border border-ink-200 text-ink-600 hover:bg-ink-50"
            >
              E-mail
            </a>
          </div>
          {!podeCompartilharArquivo && (
            <p className="text-[11px] text-ink-400 mt-2">
              Seu navegador não compartilha o arquivo direto pro WhatsApp — baixe o PDF acima e anexe manualmente.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
