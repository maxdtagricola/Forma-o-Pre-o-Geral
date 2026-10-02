import { useEffect, useMemo, useState } from 'react'
import { Button } from './ui/Basics'
import { abrirPaginaParaImpressao, baixarBlob, compartilharArquivo, linkEmail, linkWhatsApp, suportaCompartilharArquivo } from '../planilhaCliente'
import { workbookParaBlobXlsx } from '../exceljsHtmlPreview'
import {
  CONDICOES_PAGAMENTO_PADRAO,
  PRAZO_ENTREGA_PADRAO,
  gerarPedidoCompra,
  nomeArquivoPedidoCompra,
  type DadosPedidoCompra,
  type ItemPedidoCompra,
  type PedidoCompraGerado,
} from '../planilhaPedidoCompra'
import { useEstadoPersistente } from '../estadoPersistente'
import { TRANSPORTADORAS } from '../types'
import { avisar } from '../dialogs'

/** O que vem da tela de Pedido de Compra: os itens (já com os valores fechados) e sugestões pros
 * campos do cabeçalho — o resto o usuário confere/preenche aqui antes de gerar. */
export interface BasePedidoCompraFornecedor {
  /** Identifica esse pedido (cotação + fornecedor) pra lembrar o que já foi preenchido no cabeçalho. */
  chave: string
  fornecedor: string
  comprador: string
  codigoCotacao: string
  itens: ItemPedidoCompra[]
  /** Transportadora da cotação de frete mais barata desse fornecedor, se houver. */
  transportadoraSugerida?: string
  /** Prazo que o fornecedor deu na cotação, quando é o mesmo pra todos os itens. */
  prazoSugerido?: string
}

interface CabecalhoPedido {
  vendedor: string
  codigoCotacao: string
  data: string // YYYY-MM-DD
  skype: string
  transportadora: string
  validadeOrcamento: string
  condicoesPagamento: string
  prazoEntrega: string
}

function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoParaData(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return a && m && d ? new Date(a, m - 1, d) : new Date()
}

export function PedidoCompraFornecedorModal({
  base,
  onClose,
}: {
  base: BasePedidoCompraFornecedor
  onClose: () => void
}) {
  // o vendedor do fornecedor (quem atendeu) costuma ser sempre o mesmo pra cada fornecedor — fica
  // lembrado por fornecedor; o resto do cabeçalho fica lembrado por pedido (cotação + fornecedor)
  const [vendedoresPorFornecedor, setVendedoresPorFornecedor] = useEstadoPersistente<Record<string, string>>(
    'pedidoCompra:vendedorPorFornecedor',
    {},
  )
  const [cabecalhosSalvos, setCabecalhosSalvos] = useEstadoPersistente<Record<string, CabecalhoPedido>>(
    'pedidoCompra:cabecalhos',
    {},
  )
  const chaveFornecedor = base.fornecedor.trim().toUpperCase()
  const [cabecalho, setCabecalho] = useState<CabecalhoPedido>(() => {
    const salvo = cabecalhosSalvos[base.chave]
    return {
      vendedor: salvo?.vendedor ?? vendedoresPorFornecedor[chaveFornecedor] ?? '',
      codigoCotacao: salvo?.codigoCotacao ?? base.codigoCotacao,
      data: hojeIso(),
      skype: salvo?.skype ?? '',
      transportadora: salvo?.transportadora ?? base.transportadoraSugerida ?? '',
      validadeOrcamento: salvo?.validadeOrcamento ?? '',
      condicoesPagamento: salvo?.condicoesPagamento ?? CONDICOES_PAGAMENTO_PADRAO,
      prazoEntrega: salvo?.prazoEntrega ?? base.prazoSugerido ?? PRAZO_ENTREGA_PADRAO,
    }
  })

  const [erro, setErro] = useState<string | undefined>(undefined)
  const [resultado, setResultado] = useState<PedidoCompraGerado | undefined>(undefined)
  const [compartilhando, setCompartilhando] = useState(false)
  const podeCompartilharArquivo = useMemo(() => suportaCompartilharArquivo(), [])
  const dataPedido = useMemo(() => isoParaData(cabecalho.data), [cabecalho.data])
  const nomeArquivo = useMemo(() => nomeArquivoPedidoCompra(base.fornecedor, dataPedido), [base.fornecedor, dataPedido])

  const dados: DadosPedidoCompra = useMemo(
    () => ({
      fornecedor: base.fornecedor,
      comprador: base.comprador,
      itens: base.itens,
      vendedor: cabecalho.vendedor.trim(),
      codigoCotacao: cabecalho.codigoCotacao.trim(),
      data: dataPedido,
      skype: cabecalho.skype.trim(),
      transportadora: cabecalho.transportadora.trim(),
      validadeOrcamento: cabecalho.validadeOrcamento.trim(),
      condicoesPagamento: cabecalho.condicoesPagamento.trim(),
      prazoEntrega: cabecalho.prazoEntrega.trim(),
    }),
    [base, cabecalho, dataPedido],
  )

  // lembra o que foi preenchido (por pedido, e o vendedor por fornecedor)
  useEffect(() => {
    setCabecalhosSalvos((prev) => ({ ...prev, [base.chave]: cabecalho }))
    if (cabecalho.vendedor.trim()) {
      setVendedoresPorFornecedor((prev) => ({ ...prev, [chaveFornecedor]: cabecalho.vendedor.trim() }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabecalho])

  // prévia ao vivo — espera a pessoa parar de digitar um instante antes de remontar
  useEffect(() => {
    let cancelado = false
    setErro(undefined)
    const timer = setTimeout(() => {
      gerarPedidoCompra(dados)
        .then((r) => {
          if (!cancelado) setResultado(r)
        })
        .catch((err) => {
          if (!cancelado) setErro(err instanceof Error ? err.message : 'Erro ao gerar o pedido de compra.')
        })
    }, 250)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [dados])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  function patch(p: Partial<CabecalhoPedido>) {
    setCabecalho((prev) => ({ ...prev, ...p }))
  }

  const titulo = `Pedido de compra — ${base.fornecedor}${dados.codigoCotacao ? ` — ${dados.codigoCotacao}` : ''}`
  const mensagem = `Segue o pedido de compra${dados.codigoCotacao ? ` ${dados.codigoCotacao}` : ''} (${base.itens.length} item${
    base.itens.length > 1 ? 's' : ''
  }) pra ${base.fornecedor}. Anexei a planilha "${nomeArquivo}".`

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
      await avisar('Não consegui compartilhar o arquivo direto — baixe a planilha acima e anexe manualmente.')
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

  const campoCls = 'field-input py-1.5 text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-w-5xl w-full max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900">Pedido de compra — {base.fornecedor}</h3>
            <p className="text-sm text-ink-400">
              {base.itens.length} item{base.itens.length > 1 ? 's' : ''} — {nomeArquivo}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <label className="block">
              <span className="field-label">Vendedor (do fornecedor)</span>
              <input
                className={`${campoCls} uppercase`}
                value={cabecalho.vendedor}
                placeholder="quem atendeu a cotação"
                onChange={(e) => patch({ vendedor: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="block">
              <span className="field-label">Transportadora</span>
              <input
                className={`${campoCls} uppercase`}
                list="pedido-compra-transportadoras"
                value={cabecalho.transportadora}
                onChange={(e) => patch({ transportadora: e.target.value.toUpperCase() })}
              />
              <datalist id="pedido-compra-transportadoras">
                {TRANSPORTADORAS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="field-label">Cotação (nº)</span>
              <input className={campoCls} value={cabecalho.codigoCotacao} onChange={(e) => patch({ codigoCotacao: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Data</span>
              <input
                type="date"
                className={campoCls}
                defaultValue={cabecalho.data}
                onChange={(e) => e.target.value && patch({ data: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="field-label">Validade do orçamento</span>
              <input
                className={`${campoCls} uppercase`}
                value={cabecalho.validadeOrcamento}
                onChange={(e) => patch({ validadeOrcamento: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="block">
              <span className="field-label">Condições de pagamento</span>
              <input
                className={`${campoCls} uppercase`}
                value={cabecalho.condicoesPagamento}
                onChange={(e) => patch({ condicoesPagamento: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="block">
              <span className="field-label">Prazo de entrega</span>
              <input
                className={`${campoCls} uppercase`}
                value={cabecalho.prazoEntrega}
                onChange={(e) => patch({ prazoEntrega: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="block">
              <span className="field-label">Skype (opcional)</span>
              <input className={campoCls} value={cabecalho.skype} onChange={(e) => patch({ skype: e.target.value })} />
            </label>
          </div>

          {erro && <p className="text-sm text-rose-600 py-4">{erro}</p>}
          {!erro && !resultado && <p className="text-sm text-ink-400 py-4 text-center">Gerando pedido…</p>}

          {resultado && (
            // a folha é sempre branca (é o papel do pedido), inclusive no modo escuro do app
            <div className="mt-4 overflow-auto rounded-xl border border-ink-200 bg-white p-3">
              <div dangerouslySetInnerHTML={{ __html: resultado.htmlPreview }} />
            </div>
          )}
        </div>

        {resultado && (
          <div className="border-t border-ink-100 pt-3 mt-3">
            <div className="flex flex-wrap gap-2 mb-3">
              <Button variant="secondary" onClick={handleBaixar}>
                Baixar planilha (.xlsx)
              </Button>
              <Button variant="secondary" onClick={() => abrirPaginaParaImpressao(resultado.htmlImpressao)}>
                Imprimir / Salvar como PDF
              </Button>
              {podeCompartilharArquivo && (
                <Button variant="secondary" onClick={handleCompartilhar} disabled={compartilhando}>
                  Compartilhar arquivo…
                </Button>
              )}
            </div>
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
              <a href={linkEmail(titulo, mensagem)} className="pill-tab border border-ink-200 text-ink-600 hover:bg-ink-50">
                E-mail
              </a>
            </div>
            {!podeCompartilharArquivo && (
              <p className="text-[11px] text-ink-400 mt-2">
                Esse navegador não anexa o arquivo automaticamente — o WhatsApp abre só com o texto. Baixe a planilha (ou o
                PDF) acima e anexe manualmente.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
