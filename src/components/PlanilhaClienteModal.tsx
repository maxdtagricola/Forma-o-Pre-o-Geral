import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFecharComEsc } from '../teclaEsc'
import { Button } from './ui/Basics'
import { PreviaPlanilhaCliente, usePlanilhaMontada } from './PreviaPlanilhaCliente'
import {
  abrirPaginaParaImpressao,
  baixarBlob,
  compartilharArquivo,
  linkEmail,
  linkWhatsApp,
  montarPlanilhaImportada,
  suportaCompartilharArquivo,
} from '../planilhaCliente'
import { gerarPlanilhaPadrao, nomePlanilhaPadrao } from '../planilhaClientePadrao'
import { avisar } from '../dialogs'
import { formatCurrency } from '../utils'
import type { PlanilhaClienteArquivo } from '../db/planilhasClienteRepo'
import type { QuoteItem } from '../types'

export function PlanilhaClienteModal({
  planilhaImportada,
  items,
  cliente,
  maquina,
  vendedor,
  onClose,
}: {
  /** A planilha que veio do cliente. O arquivo fica à parte da cotação no servidor — só vem quando a
   * janela abre. Sem ela, a planilha é gerada do zero no molde padrão. */
  planilhaImportada?: { nomeArquivo: string; carregar: () => Promise<PlanilhaClienteArquivo | undefined> }
  items: QuoteItem[]
  cliente: string
  maquina: string
  vendedor: string
  onClose: () => void
}) {
  const [compartilhando, setCompartilhando] = useState(false)
  const podeCompartilharArquivo = useMemo(() => suportaCompartilharArquivo(), [])
  // o aviso de "já tem valor na planilha" sai uma vez só por abertura
  const jaAvisou = useRef(false)
  const titulo = `Orçamento — ${cliente || 'cliente'} — ${maquina || 'máquina'}`
  const nomeArquivo = planilhaImportada?.nomeArquivo ?? nomePlanilhaPadrao({ cliente, maquina })

  const montar = useCallback(
    () =>
      planilhaImportada
        ? montarPlanilhaImportada(planilhaImportada.carregar, items, nomeArquivo, titulo)
        : gerarPlanilhaPadrao(items, { cliente, maquina, vendedor }, titulo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, nomeArquivo],
  )
  const { resultado, erro } = usePlanilhaMontada(montar)

  // a planilha do cliente já tinha valor nessas linhas — o site não escreveu por cima; avisa na hora
  useEffect(() => {
    const conflitos = resultado?.itensComValorNaPlanilha ?? []
    if (conflitos.length > 0 && !jaAvisou.current) {
      jaAvisou.current = true
      void avisar(
        `${conflitos.length === 1 ? 'Um item já tem' : `${conflitos.length} itens já têm`} valor na planilha do cliente — ` +
          'esses valores foram mantidos, o site não escreveu por cima:\n\n' +
          conflitos
            .slice(0, 12)
            .map((c) => `• ${c.referencia}: ${formatCurrency(c.valorNaPlanilha)} na planilha (o site calculou ${formatCurrency(c.valorDoSite)})`)
            .join('\n') +
          (conflitos.length > 12 ? `\n… e mais ${conflitos.length - 12}.` : ''),
        { titulo: 'Item já com valor na planilha' },
      )
    }
  }, [resultado])

  useFecharComEsc(onClose)

  const mensagem = `Segue o orçamento atualizado (${cliente || 'cliente'} — ${maquina || 'máquina'}). Anexei a planilha "${nomeArquivo}".`

  // o navegador rejeita o compartilhamento de duas formas bem diferentes: o usuário fecha a folha
  // de compartilhamento sem escolher nada (AbortError — cancelamento de propósito, não é erro), ou
  // o compartilhamento falha de verdade (celular/app não aceitou o arquivo daquele jeito). Tratar
  // as duas iguais fazia o botão "não fazer nada" numa falha de verdade, sem avisar nem cair num
  // plano B — foi isso que quebrou no celular.
  async function handleCompartilhar() {
    if (!resultado) return
    setCompartilhando(true)
    try {
      await compartilharArquivo(resultado.arquivo, nomeArquivo, titulo, mensagem, resultado.arquivo.type)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      await avisar('Não consegui compartilhar o arquivo direto — baixe a planilha acima e anexe manualmente.')
    } finally {
      setCompartilhando(false)
    }
  }

  // sem compartilhamento nativo de arquivo (desktop, a maioria), o link "wa.me" abre o WhatsApp só
  // com o texto — com compartilhamento nativo (celular), abre a folha de compartilhamento do
  // sistema já com a planilha .xlsx anexada, o WhatsApp aparece como uma das opções.
  async function handleWhatsApp() {
    if (podeCompartilharArquivo && resultado) {
      setCompartilhando(true)
      try {
        await compartilharArquivo(resultado.arquivo, nomeArquivo, titulo, mensagem, resultado.arquivo.type)
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
            <h3 className="font-display text-lg font-semibold text-ink-900">Planilha do cliente</h3>
            <p className="text-sm text-ink-400 break-all">{nomeArquivo}</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
            ×
          </button>
        </div>

        {erro && <p className="text-sm text-rose-600 py-4">{erro}</p>}
        {!erro && !resultado && <p className="text-sm text-ink-400 py-4">Carregando a planilha…</p>}

        {resultado && (
          <>
            <PreviaPlanilhaCliente resultado={resultado} gerada={!planilhaImportada} />

            <div className="flex flex-wrap gap-2 mb-3">
              <Button variant="secondary" onClick={() => baixarBlob(resultado.arquivo, nomeArquivo)}>
                Baixar planilha (.{nomeArquivo.split('.').pop()?.toLowerCase() || 'xlsx'})
              </Button>
              <Button variant="secondary" onClick={() => abrirPaginaParaImpressao(resultado.paginaImpressao)}>
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
