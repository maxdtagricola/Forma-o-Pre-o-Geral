import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { TextField, AutocompleteField, NumberField, SelectField, DateField } from '../components/ui/Field'
import { Button } from '../components/ui/Basics'
import { listFornecedores } from '../db/fornecedoresRepo'
import { listEmpresas } from '../db/empresasRepo'
import { getStatusColors } from '../db/configRepo'
import { findProdutoPorInternoOuReferencia } from '../db/produtosRepo'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { formatCurrency, formatDate, makeId } from '../utils'
import { formatarNumeroCurtoBR, parseNumeroFlexivel } from '../numeros'
import {
  DEFAULT_NOTA_FISCAL,
  NECESSIDADES_TRANSFERENCIA,
  NOTA_FISCAL_STATUSES,
  NOTA_FISCAL_TIPOS,
  RECEBEDORES,
  RESULTADOS_DO_PRODUTO,
  RESULTADOS_TRANSFERENCIA,
  TRANSPORTADORAS,
  labelNecessidade,
  labelResultado,
} from '../types'
import type {
  Empresa,
  Fornecedor,
  NotaFiscal,
  NotaFiscalItem,
  NotaFiscalStatus,
  NotaFiscalTipo,
  ResultadoTransferencia,
} from '../types'
import {
  chaveMes,
  chaveMesDaNota,
  labelCurtoDoMes,
  labelDoMes,
  labelDoTipo,
  partesDoItem,
  prejuizoAutomatico,
  resultadoDaNota,
  resultadoDoItem,
  valoresPorResultado,
} from '../notasFiscaisHelpers'
import {
  extrairDadosNotaFiscalImagem,
  extrairDadosNotaFiscalPdf,
  type DadosExtraidosNotaFiscal,
  type ItemNotaExtraido,
} from '../pdfNotaFiscal'
import { interpretarXmlFrete, interpretarXmlNotaFiscal, tipoDoXml } from '../xmlNotaFiscal'
import { useEstadoPersistente } from '../estadoPersistente'
import { avisar, confirmar } from '../dialogs'

// -----------------------------------------------------------------------
// Registro de notas — a mesma tela serve "Transferências Fiscais" e
// "Notas Fiscais" (cada uma com a sua coleção no servidor, ver config).
//
// Organização da lista: as notas do mês atual e TODAS as que ainda estão em
// aberto (qualquer status antes de CONCLUIDO, de qualquer mês) ficam na lista
// principal; só as concluídas de meses anteriores vão pra pasta do mês. As
// pastas ficam pra sempre (sem prazo de retenção nem "arquivamento") — é o
// histórico de longo prazo.
// -----------------------------------------------------------------------

export type DadosNota = Omit<NotaFiscal, 'id' | 'criadoPor' | 'createdAt' | 'status' | 'statusHistory'>

export interface ConfigRegistroNotas {
  /** Prefixo das chaves de localStorage (rascunho do formulário, grupos abertos…). */
  prefixoChave: string
  tituloRegistro: string
  tituloLista: string
  listar: () => Promise<NotaFiscal[]>
  salvar: (dados: DadosNota, criadoPor: string, existingId?: string, statusInicial?: NotaFiscalStatus) => Promise<NotaFiscal>
  atualizarStatus: (id: string, status: NotaFiscalStatus) => Promise<NotaFiscal>
  excluir: (id: string) => Promise<void>
  /** Mostra o "resultado" (faturado / parado no estoque) da nota e dos produtos — usado nas
   * Transferências, onde isso alimenta o gráfico de faturamento × prejuízo do dashboard. */
  controleResultado?: boolean
}

const STATUS_CONCLUIDO: NotaFiscalStatus = 'CONCLUIDO'
const FILTRO_SEM_NECESSIDADE = '__sem__'
const FILTRO_SEM_RESULTADO = '__sem__'

const transportadoraSuggestions = TRANSPORTADORAS.map((t) => ({ value: t, label: t }))
const recebedorSuggestions = RECEBEDORES.map((r) => ({ value: r, label: r }))
const statusOptions = NOTA_FISCAL_STATUSES.map((s) => ({ value: s, label: s }))

function itensDaNota(n: { itens?: NotaFiscalItem[] }): NotaFiscalItem[] {
  return n.itens ?? []
}

/** Necessidade que vale pro produto: a dele mesmo, ou (vazia) a da nota. */
function necessidadeEfetiva(item: NotaFiscalItem, nota: { necessidade?: string }): string {
  return item.necessidade || nota.necessidade || ''
}

/** Os dados editáveis de uma nota já salva (sem id/status/histórico) — pra regravar só um detalhe dela. */
function dadosDaNota(n: NotaFiscal): DadosNota {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, criadoPor, createdAt, status, statusHistory, ...dados } = n
  return dados
}

function itemDeExtraido(extraido: ItemNotaExtraido): NotaFiscalItem {
  return { id: makeId(), ...extraido, necessidade: '' }
}

function itemVazio(): NotaFiscalItem {
  return { id: makeId(), codigo: '', descricao: '', ncm: '', unidade: '', quantidade: 0, valorUnitario: 0, valorTotal: 0, necessidade: '' }
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100
}

// ---------------------------------------------------------------------------------------------
// Seletor de necessidade — opções fixas + qualquer outra digitada ("Outra…")
// ---------------------------------------------------------------------------------------------
function SeletorNecessidade({
  valor,
  onChange,
  opcoesExtras,
  rotuloVazio,
  className = '',
  compacto = false,
}: {
  valor: string
  onChange: (valor: string) => void
  /** Necessidades personalizadas já usadas em outras notas — aparecem na lista também. */
  opcoesExtras: string[]
  rotuloVazio: string
  className?: string
  compacto?: boolean
}) {
  const fixa = !valor || NECESSIDADES_TRANSFERENCIA.some((n) => n.value === valor) || opcoesExtras.includes(valor)
  const [digitando, setDigitando] = useState(!fixa)
  const [texto, setTexto] = useState(fixa ? '' : valor)
  const valorAnterior = useRef(valor)

  // só reage quando o VALOR muda (trocar de nota, importar…) — não a cada nova lista de opções,
  // senão fecharia o campo "Outra…" no meio da digitação
  useEffect(() => {
    if (valorAnterior.current === valor) return
    valorAnterior.current = valor
    const ehConhecida = !valor || NECESSIDADES_TRANSFERENCIA.some((n) => n.value === valor) || opcoesExtras.includes(valor)
    if (ehConhecida) setDigitando(false)
    else {
      setDigitando(true)
      setTexto(valor)
    }
  }, [valor, opcoesExtras])

  const cls = compacto
    ? 'w-full rounded-md border border-ink-200 bg-surface px-1.5 py-1 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-400'
    : 'field-input'

  if (digitando) {
    return (
      <div className={`flex gap-1 ${className}`}>
        <input
          autoFocus
          className={cls}
          value={texto}
          placeholder="Qual a necessidade?"
          onChange={(e) => setTexto(e.target.value.toUpperCase())}
          onBlur={() => {
            const limpo = texto.trim()
            onChange(limpo)
            if (!limpo) setDigitando(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button
          type="button"
          title="Voltar pra lista"
          onClick={() => {
            setDigitando(false)
            setTexto('')
            onChange('')
          }}
          className="shrink-0 rounded-md px-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <select
      className={`${cls} ${className}`}
      value={valor}
      onChange={(e) => {
        if (e.target.value === '__outra__') {
          setTexto('')
          setDigitando(true)
          return
        }
        onChange(e.target.value)
      }}
    >
      <option value="">{rotuloVazio}</option>
      {NECESSIDADES_TRANSFERENCIA.map((n) => (
        <option key={n.value} value={n.value}>
          {n.label}
        </option>
      ))}
      {opcoesExtras.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__outra__">Outra…</option>
    </select>
  )
}

function BadgeNecessidade({ valor, herdada = false }: { valor: string; herdada?: boolean }) {
  if (!valor) return null
  return (
    <span
      title={herdada ? 'Necessidade da nota (vale pra esse produto)' : 'Necessidade da transferência'}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        herdada ? 'border-dashed border-ink-300 text-ink-500' : 'border-ink-300 bg-ink-100 text-ink-700'
      }`}
    >
      {labelNecessidade(valor)}
    </span>
  )
}

// ---------------------------------------------------------------------------------------------
// Resultado da transferência — faturado (virou venda) ou parado no estoque (prejuízo)
// ---------------------------------------------------------------------------------------------
function SeletorResultado({
  valor,
  onChange,
  rotuloVazio,
  compacto = false,
  disabled = false,
  ariaLabel,
  doProduto = false,
}: {
  valor: ResultadoTransferencia
  onChange: (valor: ResultadoTransferencia) => void
  rotuloVazio: string
  compacto?: boolean
  disabled?: boolean
  ariaLabel?: string
  /** De um produto (tem também o "parcialmente faturado"), não da nota inteira. */
  doProduto?: boolean
}) {
  const cls = compacto
    ? 'w-full rounded-md border border-ink-200 bg-surface px-1.5 py-1 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-60'
    : 'field-input'
  return (
    <select
      className={cls}
      value={valor}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as ResultadoTransferencia)}
    >
      <option value="">{rotuloVazio}</option>
      {(doProduto ? RESULTADOS_DO_PRODUTO : RESULTADOS_TRANSFERENCIA).map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  )
}

/** "3 de 5 UN" — quanto de um produto parcialmente faturado foi faturado. */
function textoQuantidadeFaturada(item: NotaFiscalItem, qtdFaturada: number): string {
  return `${formatarNumeroCurtoBR(qtdFaturada, 4)} de ${formatarNumeroCurtoBR(item.quantidade || 0, 4)}${item.unidade ? ` ${item.unidade}` : ''}`
}

function BadgeResultado({
  valor,
  herdado = false,
  automatico = false,
  parcial,
}: {
  valor: ResultadoTransferencia | undefined
  herdado?: boolean
  /** Prejuízo que veio da regra (deu entrada e ninguém marcou que vendeu), não de uma marcação. */
  automatico?: boolean
  /** Do parcialmente faturado: "3 de 5 UN". */
  parcial?: string
}) {
  if (!valor) return null
  if (valor === 'PARCIAL') {
    return (
      <span
        title="Parcialmente faturado — o resto continua parado no estoque (prejuízo até vender)"
        className="inline-flex items-center gap-1 rounded-full border border-[#2a78d6]/50 bg-gradient-to-r from-[#2a78d6]/10 to-[#e34948]/10 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[#1d5fae] dark:text-[#8db8ee]"
      >
        <span aria-hidden>◐</span>
        Parcial{parcial ? ` · ${parcial}` : ''}
      </span>
    )
  }
  const faturado = valor === 'FATURADO'
  return (
    <span
      title={
        automatico
          ? 'Deu entrada e ainda não foi marcado como faturado — conta como prejuízo até vender'
          : herdado
            ? 'Resultado da nota (vale pra esse produto)'
            : faturado
              ? 'Faturado — virou venda'
              : 'Parado no estoque — não gerou o lucro esperado (prejuízo)'
      }
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
        herdado || automatico ? 'border-dashed' : ''
      } ${
        faturado
          ? 'border-[#2a78d6]/50 bg-[#2a78d6]/10 text-[#1d5fae] dark:text-[#8db8ee]'
          : 'border-[#e34948]/50 bg-[#e34948]/10 text-[#b52d2c] dark:text-[#f19c9b]'
      }`}
    >
      <span aria-hidden>{faturado ? '✓' : '▼'}</span>
      {faturado ? 'Faturado' : automatico ? 'Prejuízo até vender' : 'Parado no estoque'}
    </span>
  )
}

// ---------------------------------------------------------------------------------------------
// Campo decimal que aceita vírgula (12,5) — guarda texto enquanto digita, converte ao sair
// ---------------------------------------------------------------------------------------------
function CampoDecimal({
  valor,
  onChange,
  casas,
  className,
  placeholder,
}: {
  valor: number
  onChange: (valor: number) => void
  casas: number
  className: string
  placeholder?: string
}) {
  const formatar = (v: number) => (v ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas === 2 ? 2 : 0, maximumFractionDigits: casas }) : '')
  const [texto, setTexto] = useState(formatar(valor))
  const focado = useRef(false)
  useEffect(() => {
    if (!focado.current) setTexto(formatar(valor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={texto}
      placeholder={placeholder}
      onFocus={(e) => {
        focado.current = true
        e.target.select()
      }}
      onChange={(e) => {
        setTexto(e.target.value)
        onChange(parseNumeroFlexivel(e.target.value) ?? 0)
      }}
      onBlur={() => {
        focado.current = false
        setTexto(formatar(valor))
      }}
    />
  )
}

// ---------------------------------------------------------------------------------------------
// Produtos da nota no formulário
// ---------------------------------------------------------------------------------------------
function ItensNotaEditor({
  itens,
  necessidadeNota,
  resultadoNota,
  controleResultado,
  opcoesExtras,
  onChange,
}: {
  itens: NotaFiscalItem[]
  necessidadeNota: string
  resultadoNota: ResultadoTransferencia
  controleResultado: boolean
  opcoesExtras: string[]
  onChange: (itens: NotaFiscalItem[]) => void
}) {
  const inputCls =
    'w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-900 hover:border-ink-200 focus:border-brand-400 focus:bg-surface focus:outline-none'

  function patchItem(id: string, patch: Partial<NotaFiscalItem>) {
    onChange(
      itens.map((item) => {
        if (item.id !== id) return item
        const proximo = { ...item, ...patch }
        // quantidade ou valor unitário mudou → total acompanha (o total digitado à mão fica como está)
        if ('quantidade' in patch || 'valorUnitario' in patch) {
          proximo.valorTotal = arredondar2(proximo.quantidade * proximo.valorUnitario)
        }
        return proximo
      }),
    )
  }

  // código digitado à mão: se o produto já existe no cadastro (pelo Interno ou por uma Referência),
  // completa descrição/NCM que ainda estiverem vazios
  async function completarPeloCadastro(item: NotaFiscalItem) {
    const codigo = item.codigo.trim()
    if (!codigo || (item.descricao.trim() && item.ncm.trim())) return
    try {
      const produto = await findProdutoPorInternoOuReferencia(codigo, codigo)
      if (!produto) return
      onChange(
        itens.map((i) =>
          i.id === item.id
            ? { ...i, descricao: i.descricao.trim() || produto.descricao, ncm: i.ncm.trim() || produto.ncm }
            : i,
        ),
      )
    } catch {
      // cadastro indisponível — segue com o que foi digitado
    }
  }

  const somaItens = itens.reduce((s, i) => s + (i.valorTotal || 0), 0)
  const rotuloHerdado = necessidadeNota ? `(da nota: ${labelNecessidade(necessidadeNota)})` : '(mesma da nota)'
  const rotuloResultadoHerdado = resultadoNota ? `(da nota: ${labelResultado(resultadoNota, true)})` : '(mesmo da nota)'

  // tirar um produto também pede confirmação — como toda exclusão de item no sistema
  async function tirarProduto(item: NotaFiscalItem) {
    const nome = [item.codigo, item.descricao].filter((x) => x.trim()).join(' — ')
    if (!(await confirmar(`Tirar este produto da nota?${nome ? `\n\n${nome}` : ''}`, { confirmText: 'Tirar', tone: 'danger' }))) return
    onChange(itens.filter((i) => i.id !== item.id))
  }

  return (
    <div className="mt-5 rounded-xl border border-ink-100">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-ink-100 bg-ink-50/60">
        <div>
          <p className="text-sm font-semibold text-ink-900">Produtos da nota</p>
          <p className="text-[11px] text-ink-400">
            Vêm sozinhos ao importar o XML (ou o PDF) da nota — dá pra conferir, ajustar ou incluir à mão. A necessidade de
            cada produto, se ficar em branco, é a da nota.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {itens.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (await confirmar(`Tirar os ${itens.length} produto(s) desta nota?`, { confirmText: 'Tirar todos', tone: 'danger' })) {
                  onChange([])
                }
              }}
              className="pill-tab border border-ink-200 py-1 text-xs text-ink-500 hover:bg-ink-50"
            >
              Limpar produtos
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange([...itens, itemVazio()])}
            className="pill-tab border border-brand-600 bg-brand-600 py-1 text-xs text-white hover:bg-brand-700"
          >
            + Adicionar produto
          </button>
        </div>
      </div>

      {itens.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-ink-400">Nenhum produto informado nesta nota ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] text-ink-400">
                <th className="px-2 py-1.5 font-medium w-28">Código</th>
                <th className="px-2 py-1.5 font-medium min-w-[14rem]">Descrição</th>
                <th className="px-2 py-1.5 font-medium w-24">NCM</th>
                <th className="px-2 py-1.5 font-medium w-14">Un</th>
                <th className="px-2 py-1.5 font-medium w-20 text-right">Qtd</th>
                <th className="px-2 py-1.5 font-medium w-28 text-right">Vlr unit.</th>
                <th className="px-2 py-1.5 font-medium w-28 text-right">Vlr total</th>
                <th className="px-2 py-1.5 font-medium min-w-[11rem]">Necessidade</th>
                {controleResultado && <th className="px-2 py-1.5 font-medium min-w-[10rem]">Resultado</th>}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="border-t border-ink-100 align-middle">
                  <td className="px-1 py-1">
                    <input
                      className={`${inputCls} font-mono`}
                      value={item.codigo}
                      onChange={(e) => patchItem(item.id, { codigo: e.target.value })}
                      onBlur={() => void completarPeloCadastro(item)}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className={inputCls}
                      value={item.descricao}
                      onChange={(e) => patchItem(item.id, { descricao: e.target.value.toUpperCase() })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className={`${inputCls} font-mono`}
                      value={item.ncm}
                      onChange={(e) => patchItem(item.id, { ncm: e.target.value.replace(/[^\d.]/g, '') })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className={inputCls}
                      value={item.unidade}
                      onChange={(e) => patchItem(item.id, { unidade: e.target.value.toUpperCase() })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CampoDecimal
                      valor={item.quantidade}
                      casas={4}
                      onChange={(v) => patchItem(item.id, { quantidade: v })}
                      className={`${inputCls} text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CampoDecimal
                      valor={item.valorUnitario}
                      casas={2}
                      onChange={(v) => patchItem(item.id, { valorUnitario: v })}
                      className={`${inputCls} text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CampoDecimal
                      valor={item.valorTotal}
                      casas={2}
                      onChange={(v) => onChange(itens.map((i) => (i.id === item.id ? { ...i, valorTotal: v } : i)))}
                      className={`${inputCls} text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <SeletorNecessidade
                      compacto
                      valor={item.necessidade}
                      onChange={(v) => patchItem(item.id, { necessidade: v })}
                      opcoesExtras={opcoesExtras}
                      rotuloVazio={rotuloHerdado}
                    />
                  </td>
                  {controleResultado && (
                    <td className="px-1 py-1">
                      <SeletorResultado
                        compacto
                        doProduto
                        valor={item.resultado ?? ''}
                        onChange={(v) =>
                          patchItem(item.id, { resultado: v, quantidadeFaturada: v === 'PARCIAL' ? item.quantidadeFaturada : undefined })
                        }
                        rotuloVazio={rotuloResultadoHerdado}
                        ariaLabel={`Resultado de ${item.descricao || item.codigo || 'produto'}`}
                      />
                      {item.resultado === 'PARCIAL' && (
                        <label className="mt-1 flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-500">
                          Faturado:
                          <CampoDecimal
                            valor={item.quantidadeFaturada ?? 0}
                            casas={4}
                            placeholder="qtd"
                            onChange={(v) => patchItem(item.id, { quantidadeFaturada: v })}
                            className="w-16 rounded-md border border-ink-200 bg-surface px-1.5 py-0.5 text-right text-xs tabular-nums text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
                          />
                          de {formatarNumeroCurtoBR(item.quantidade || 0, 4)} {item.unidade}
                        </label>
                      )}
                    </td>
                  )}
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => void tirarProduto(item)}
                      title="Tirar esse produto"
                      aria-label="Tirar esse produto"
                      className="h-6 w-6 rounded-full text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-200 bg-ink-50/60 text-xs">
                <td colSpan={4} className="px-2 py-1.5 text-ink-500">
                  {itens.length} produto{itens.length > 1 ? 's' : ''} ·{' '}
                  {formatarNumeroCurtoBR(itens.reduce((s, i) => s + (i.quantidade || 0), 0), 4)} un. no total
                </td>
                <td colSpan={2} className="px-2 py-1.5 text-right text-ink-500">
                  Soma dos produtos
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-ink-900">{formatCurrency(somaItens)}</td>
                <td colSpan={controleResultado ? 3 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------------------------

/** O que marcar direto da lista: o resultado da nota inteira, ou (com itemId) o de um produto dela —
 * o parcialmente faturado leva junto quantas unidades foram faturadas. */
export interface AlvoResultado {
  itemId?: string
  resultado: ResultadoTransferencia
  quantidadeFaturada?: number
}

export type MarcarResultado = (n: NotaFiscal, alvo: AlvoResultado) => Promise<void>

/** Resumo do resultado no topo do cartão: o selo, quando a nota inteira tem um só; com produtos de
 * resultados diferentes, quantos foram faturados, quantos em parte e quantos ficaram parados. */
function ResumoResultadoNota({ n }: { n: NotaFiscal }) {
  const itens = itensDaNota(n)
  // prejuízo que veio só da regra da entrada — nem a nota nem os produtos foram marcados
  const automatico = !n.resultado && prejuizoAutomatico(n) && itens.every((i) => !i.resultado)
  if (itens.length === 0) return <BadgeResultado valor={resultadoDaNota(n)} automatico={automatico} />
  const efetivos = itens.map((i) => resultadoDoItem(i, n))
  const faturados = efetivos.filter((r) => r === 'FATURADO').length
  const parciais = efetivos.filter((r) => r === 'PARCIAL').length
  const parados = efetivos.filter((r) => r === 'ESTOQUE').length
  if (faturados === itens.length) return <BadgeResultado valor="FATURADO" />
  if (parados === itens.length) return <BadgeResultado valor="ESTOQUE" automatico={automatico} />
  if (faturados === 0 && parciais === 0 && parados === 0) return null
  const partes = [
    faturados > 0 && `${faturados} faturado${faturados === 1 ? '' : 's'}`,
    parciais > 0 && `${parciais} faturado${parciais === 1 ? '' : 's'} em parte`,
    parados > 0 && `${parados} parado${parados === 1 ? '' : 's'} no estoque`,
  ].filter(Boolean)
  return <span className="text-[11px] text-ink-500">{partes.join(' · ')}</span>
}

/** Resultado de um produto marcado direto da lista: faturado / parado no estoque salvam na hora; o
 * parcialmente faturado pede antes quantas unidades foram faturadas (o resto fica no estoque). */
function ResultadoDoProduto({
  item,
  nota,
  disabled,
  onMarcar,
}: {
  item: NotaFiscalItem
  nota: NotaFiscal
  disabled: boolean
  onMarcar: (alvo: AlvoResultado) => Promise<void>
}) {
  const [escolhendoParcial, setEscolhendoParcial] = useState(false)
  const [qtd, setQtd] = useState(item.quantidadeFaturada ?? 0)
  useEffect(() => {
    setQtd(item.quantidadeFaturada ?? 0)
  }, [item.quantidadeFaturada])
  const escolha: ResultadoTransferencia = escolhendoParcial ? 'PARCIAL' : (item.resultado ?? '')
  const total = item.quantidade || 0
  const alterado = item.resultado !== 'PARCIAL' || qtd !== (item.quantidadeFaturada ?? 0)

  async function salvarParcial() {
    if (!(qtd > 0)) {
      void avisar('Digite quantas unidades desse produto foram faturadas.')
      return
    }
    if (total > 0 && qtd >= total) {
      await onMarcar({ itemId: item.id, resultado: 'FATURADO' })
      void avisar('Foi faturada a quantidade toda — o produto ficou como Faturado.')
    } else {
      await onMarcar({ itemId: item.id, resultado: 'PARCIAL', quantidadeFaturada: qtd })
    }
    setEscolhendoParcial(false)
  }

  return (
    <div>
      <SeletorResultado
        compacto
        doProduto
        disabled={disabled}
        valor={escolha}
        onChange={(v) => {
          if (v === 'PARCIAL') {
            setEscolhendoParcial(true)
            return
          }
          setEscolhendoParcial(false)
          void onMarcar({ itemId: item.id, resultado: v })
        }}
        rotuloVazio={
          nota.resultado
            ? `(da nota: ${labelResultado(nota.resultado, true)})`
            : prejuizoAutomatico(nota)
              ? '(prejuízo até vender)'
              : '(mesmo da nota)'
        }
        ariaLabel={`Resultado de ${item.descricao || item.codigo || 'produto'}`}
      />
      {escolha === 'PARCIAL' && (
        <div className="mt-1 flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-500">
          <label className="flex items-center gap-1">
            Faturado:
            <CampoDecimal
              valor={qtd}
              casas={4}
              placeholder="qtd"
              onChange={setQtd}
              className="w-14 rounded-md border border-ink-200 bg-surface px-1.5 py-0.5 text-right text-xs tabular-nums text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </label>
          de {formatarNumeroCurtoBR(total, 4)} {item.unidade}
          {alterado && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void salvarParcial()}
              className="rounded-md bg-brand-600 px-1.5 py-0.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Salvar
            </button>
          )}
          {escolhendoParcial && item.resultado !== 'PARCIAL' && (
            <button
              type="button"
              onClick={() => setEscolhendoParcial(false)}
              aria-label="Cancelar o parcialmente faturado"
              className="h-5 w-5 rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function NotaCard({
  n,
  mesAtualKey,
  corDoStatus,
  onEdit,
  onAbrirStatus,
  controleResultado,
  onMarcarResultado,
}: {
  n: NotaFiscal
  mesAtualKey: string
  corDoStatus: (status: string) => string
  onEdit: (n: NotaFiscal) => void
  onAbrirStatus: (n: NotaFiscal) => void
  controleResultado: boolean
  onMarcarResultado: MarcarResultado
}) {
  const [expandido, setExpandido] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [salvandoResultado, setSalvandoResultado] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const itens = itensDaNota(n)
  const mesDaNota = chaveMesDaNota(n)

  async function marcar(alvo: AlvoResultado) {
    setSalvandoResultado(true)
    try {
      await onMarcarResultado(n, alvo)
    } finally {
      setSalvandoResultado(false)
    }
  }

  useEffect(() => {
    if (!menuAberto) return
    function aoClicarFora(e: Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [menuAberto])

  return (
    <div className="rounded-lg border border-ink-100 overflow-hidden">
      <div className="flex items-center gap-2 pl-1 pr-2 py-2">
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-label={expandido ? 'Recolher detalhes' : 'Expandir detalhes'}
          className="shrink-0 h-7 w-7 flex items-center justify-center rounded text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
        >
          <span className={`inline-block transition-transform ${expandido ? 'rotate-90' : ''}`}>▸</span>
        </button>

        <button
          type="button"
          onClick={() => onAbrirStatus(n)}
          title="Clique pra alterar o status"
          className="flex-1 min-w-0 flex flex-wrap items-center gap-2 text-left py-1"
        >
          <span className="font-mono text-sm text-ink-800">{n.numeroNfe}</span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: corDoStatus(n.status), color: corTexto(corDoStatus(n.status)) }}
          >
            {n.status}
          </span>
          {/* em aberto de um mês anterior: fica na lista principal até concluir — a etiqueta diz de quando é */}
          {mesDaNota !== mesAtualKey && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              ref. {labelCurtoDoMes(mesDaNota)}
            </span>
          )}
          <BadgeNecessidade valor={n.necessidade ?? ''} />
          {controleResultado && <ResumoResultadoNota n={n} />}
          {itens.length > 0 && (
            <span className="text-[11px] text-ink-400">
              {itens.length} produto{itens.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="ml-auto text-sm font-mono tabular-nums text-ink-600">{formatCurrency(n.valorNota)}</span>
        </button>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuAberto((v) => !v)
            }}
            aria-label="Mais opções"
            className="h-7 w-7 flex items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
          >
            ⋯
          </button>
          {menuAberto && (
            <div className="absolute right-0 top-8 z-10 w-32 rounded-lg border border-ink-100 bg-surface py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuAberto(false)
                  onEdit(n)
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                Editar
              </button>
            </div>
          )}
        </div>
      </div>

      {expandido && (
        <div className="px-3 pb-3 pt-1 border-t border-ink-50 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
            <div>
              <p className="text-ink-400">Tipo</p>
              <p className="text-ink-700 font-medium">{labelDoTipo(n.tipo ?? 'PECAS')}</p>
            </div>
            <div>
              <p className="text-ink-400">Fornecedor</p>
              <p className="text-ink-700">{n.fornecedor || '—'}</p>
            </div>
            <div>
              <p className="text-ink-400">Recebedor</p>
              <p className="text-ink-700">{n.recebedor || '—'}</p>
            </div>
            <div>
              <p className="text-ink-400">Transportadora</p>
              <p className="text-ink-700">{n.transportadora || '—'}</p>
            </div>
            <div>
              <p className="text-ink-400">Valor frete</p>
              <p className="text-ink-700 font-mono">{formatCurrency(n.valorFrete)}</p>
            </div>
            <div>
              <p className="text-ink-400">Emitida em</p>
              <p className="text-ink-700">
                {n.dataEmissao ? new Date(`${n.dataEmissao}T00:00:00`).toLocaleDateString('pt-BR') : '—'}
              </p>
            </div>
            <div>
              <p className="text-ink-400">Registrada em</p>
              <p className="text-ink-700">{formatDate(n.createdAt)}</p>
            </div>
            <div>
              <p className="text-ink-400">Necessidade</p>
              <p className="text-ink-700">{labelNecessidade(n.necessidade) || '—'}</p>
            </div>
          </div>

          {controleResultado && (
            // marcar faturado / parado no estoque direto daqui, sem abrir a edição da nota — o
            // resultado de cada produto (se for diferente) fica na tabela logo abaixo
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-400">Resultado da nota inteira:</span>
              {RESULTADOS_TRANSFERENCIA.map((r) => {
                const ativo = n.resultado === r.value
                const faturado = r.value === 'FATURADO'
                return (
                  <button
                    key={r.value}
                    type="button"
                    disabled={salvandoResultado}
                    aria-pressed={ativo}
                    onClick={() => void marcar({ resultado: ativo ? '' : r.value })}
                    title={ativo ? 'Clique de novo pra tirar a marcação' : undefined}
                    className={`rounded-full border px-2.5 py-1 font-semibold transition disabled:opacity-50 ${
                      ativo
                        ? faturado
                          ? 'border-[#2a78d6] bg-[#2a78d6] text-white'
                          : 'border-[#e34948] bg-[#e34948] text-white'
                        : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    {faturado ? '✓ ' : '▼ '}
                    {r.label}
                  </button>
                )
              })}
              {salvandoResultado && <span className="text-ink-400">salvando…</span>}
              {!n.resultado && prejuizoAutomatico(n) && (
                <span className="text-[#b52d2c] dark:text-[#f19c9b]">
                  Deu entrada: o que não for marcado como faturado conta como prejuízo até ser vendido.
                </span>
              )}
            </div>
          )}

          {itens.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-ink-100">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-ink-50 text-left text-ink-400">
                    <th className="px-2 py-1.5 font-medium">Código</th>
                    <th className="px-2 py-1.5 font-medium">Descrição</th>
                    <th className="px-2 py-1.5 font-medium text-right">Qtd</th>
                    <th className="px-2 py-1.5 font-medium text-right">Vlr unit.</th>
                    <th className="px-2 py-1.5 font-medium text-right">Vlr total</th>
                    <th className="px-2 py-1.5 font-medium">Necessidade</th>
                    {controleResultado && <th className="px-2 py-1.5 font-medium min-w-[9.5rem]">Resultado</th>}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item) => (
                    <tr key={item.id} className="border-t border-ink-100">
                      <td className="px-2 py-1 font-mono text-ink-700">{item.codigo || '—'}</td>
                      <td className="px-2 py-1 text-ink-800">{item.descricao || '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-ink-700">
                        {formatarNumeroCurtoBR(item.quantidade, 4)} {item.unidade}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-ink-700">{formatCurrency(item.valorUnitario)}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-ink-900">{formatCurrency(item.valorTotal)}</td>
                      <td className="px-2 py-1">
                        <BadgeNecessidade valor={necessidadeEfetiva(item, n)} herdada={!item.necessidade} />
                      </td>
                      {controleResultado && (
                        <td className="px-2 py-1">
                          <ResultadoDoProduto item={item} nota={n} disabled={salvandoResultado} onMarcar={marcar} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GrupoStatusTable({
  prefixoChave,
  grupo,
  mesAtualKey,
  corDoStatus,
  onEdit,
  onAbrirStatus,
  controleResultado,
  onMarcarResultado,
}: {
  prefixoChave: string
  grupo: { status: NotaFiscalStatus; itens: NotaFiscal[] }
  mesAtualKey: string
  corDoStatus: (status: string) => string
  onEdit: (n: NotaFiscal) => void
  onAbrirStatus: (n: NotaFiscal) => void
  controleResultado: boolean
  onMarcarResultado: MarcarResultado
}) {
  const [aberto, setAberto] = useEstadoPersistente(`${prefixoChave}:grupoStatusAberto:${grupo.status}`, false)
  return (
    <div>
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-2 mb-2 text-left">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: corDoStatus(grupo.status), color: corTexto(corDoStatus(grupo.status)) }}
        >
          {grupo.status}
        </span>
        <span className="text-xs text-ink-400">{grupo.itens.length}</span>
        <span aria-hidden className={`ml-auto text-ink-400 transition-transform ${aberto ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {aberto && (
        <div className="space-y-2">
          {grupo.itens.map((n) => (
            <NotaCard
              key={n.id}
              n={n}
              mesAtualKey={mesAtualKey}
              corDoStatus={corDoStatus}
              onEdit={onEdit}
              onAbrirStatus={onAbrirStatus}
              controleResultado={controleResultado}
              onMarcarResultado={onMarcarResultado}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function agruparPorStatus(notas: NotaFiscal[]): { status: NotaFiscalStatus; itens: NotaFiscal[] }[] {
  return NOTA_FISCAL_STATUSES.map((status) => ({
    status,
    itens: notas.filter((n) => n.status === status).sort((a, b) => b.createdAt - a.createdAt),
  })).filter((g) => g.itens.length > 0)
}

function PastaMes({
  prefixoChave,
  mesKey,
  itens,
  mesAtualKey,
  corDoStatus,
  onEdit,
  onAbrirStatus,
  controleResultado,
  onMarcarResultado,
}: {
  prefixoChave: string
  mesKey: string
  itens: NotaFiscal[]
  mesAtualKey: string
  corDoStatus: (status: string) => string
  onEdit: (n: NotaFiscal) => void
  onAbrirStatus: (n: NotaFiscal) => void
  controleResultado: boolean
  onMarcarResultado: MarcarResultado
}) {
  const [aberta, setAberta] = useEstadoPersistente(`${prefixoChave}:pastaMesAberta:${mesKey}`, false)
  const [completa, setCompleta] = useState(false)

  const valorTotal = itens.reduce((s, n) => s + n.valorNota, 0)
  const valorFrete = itens.reduce((s, n) => s + n.valorFrete, 0)
  const totalProdutos = itens.reduce((s, n) => s + itensDaNota(n).length, 0)
  const grupos = agruparPorStatus(itens)
  const resultadosDoMes = itens.reduce(
    (acc, n) => {
      const v = valoresPorResultado(n)
      return { faturado: acc.faturado + v.faturado, parado: acc.parado + v.parado }
    },
    { faturado: 0, parado: 0 },
  )

  return (
    <div className="rounded-xl border border-ink-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-ink-50 hover:bg-ink-100 transition text-left"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden>📁</span>
          <span className="font-medium text-ink-900">{labelDoMes(mesKey)}</span>
          <span className="text-xs text-ink-400">
            {itens.length} nota{itens.length === 1 ? '' : 's'} concluída{itens.length === 1 ? '' : 's'}
          </span>
        </div>
        <span className="text-xs font-mono tabular-nums text-ink-600">{formatCurrency(valorTotal)}</span>
      </button>

      {aberta && (
        <div className="p-4 border-t border-ink-100 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-ink-400 text-xs">Notas</p>
              <p className="font-medium text-ink-900">{itens.length}</p>
            </div>
            <div>
              <p className="text-ink-400 text-xs">Produtos</p>
              <p className="font-medium text-ink-900">{totalProdutos}</p>
            </div>
            <div>
              <p className="text-ink-400 text-xs">Valor total</p>
              <p className="font-medium text-ink-900">{formatCurrency(valorTotal)}</p>
            </div>
            <div>
              <p className="text-ink-400 text-xs">Valor de frete</p>
              <p className="font-medium text-ink-900">{formatCurrency(valorFrete)}</p>
            </div>
            {controleResultado && (
              <>
                <div>
                  <p className="text-ink-400 text-xs">Faturado</p>
                  <p className="font-medium text-ink-900">{formatCurrency(resultadosDoMes.faturado)}</p>
                </div>
                <div>
                  <p className="text-ink-400 text-xs">Parado no estoque (prejuízo)</p>
                  <p className="font-medium text-ink-900">{formatCurrency(resultadosDoMes.parado)}</p>
                </div>
              </>
            )}
          </div>

          {!completa ? (
            <Button variant="secondary" onClick={() => setCompleta(true)}>
              Ver visualização completa
            </Button>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" onClick={() => setCompleta(false)}>
                Ocultar visualização completa
              </Button>
              <div className="space-y-6">
                {grupos.map((grupo) => (
                  <GrupoStatusTable
                    key={grupo.status}
                    prefixoChave={`${prefixoChave}:pasta:${mesKey}`}
                    grupo={grupo}
                    mesAtualKey={mesAtualKey}
                    corDoStatus={corDoStatus}
                    onEdit={onEdit}
                    onAbrirStatus={onAbrirStatus}
                    controleResultado={controleResultado}
                    onMarcarResultado={onMarcarResultado}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AlterarStatusModal({
  nota,
  corDoStatus,
  onSelecionar,
  onFechar,
}: {
  nota: NotaFiscal
  corDoStatus: (status: string) => string
  onSelecionar: (status: NotaFiscalStatus) => void
  onFechar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-sm p-4" onClick={onFechar}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-400">Alterar status</p>
            <h3 className="font-display text-base font-semibold text-ink-900 truncate">NF-e {nota.numeroNfe}</h3>
            <p className="text-xs text-ink-400 truncate">{nota.fornecedor || 'Fornecedor não informado'}</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 h-7 w-7 rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          {NOTA_FISCAL_STATUSES.map((s) => {
            const ativo = s === nota.status
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSelecionar(s)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition ${
                  ativo ? 'border-ink-900 ring-2 ring-ink-900/10 bg-ink-50' : 'border-ink-100 hover:border-ink-300 hover:bg-ink-50'
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: corDoStatus(s) }} />
                <span className="flex-1 text-ink-800">{s}</span>
                {ativo && <span className="text-xs text-ink-400">atual</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Visão por produto: todas as linhas de produto das notas que passam nos filtros, uma por linha —
 * pra ver o que foi transferido, pra onde, quando e por qual necessidade. */
function ListaItensTransferidos({
  linhas,
  corDoStatus,
  controleResultado,
}: {
  linhas: { nota: NotaFiscal; item: NotaFiscalItem }[]
  corDoStatus: (status: string) => string
  controleResultado: boolean
}) {
  const totalQtd = linhas.reduce((s, l) => s + (l.item.quantidade || 0), 0)
  const totalValor = linhas.reduce((s, l) => s + (l.item.valorTotal || 0), 0)
  const totalFaturado = linhas.reduce((s, l) => s + partesDoItem(l.item, l.nota).faturado, 0)
  const totalParado = linhas.reduce((s, l) => s + partesDoItem(l.item, l.nota).parado, 0)
  if (linhas.length === 0) {
    return <p className="text-sm text-ink-400 text-center py-6">Nenhum produto com esses filtros.</p>
  }
  return (
    <>
    {controleResultado && (totalFaturado > 0 || totalParado > 0) && (
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        <span>
          Faturado: <strong className="font-mono tabular-nums text-ink-900">{formatCurrency(totalFaturado)}</strong>
        </span>
        <span>
          Parado no estoque (prejuízo): <strong className="font-mono tabular-nums text-ink-900">{formatCurrency(totalParado)}</strong>
        </span>
      </div>
    )}
    <div className="overflow-x-auto rounded-xl border border-ink-100">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-ink-50 text-left text-ink-400">
            <th className="px-2 py-2 font-medium">Emissão</th>
            <th className="px-2 py-2 font-medium">NF-e</th>
            <th className="px-2 py-2 font-medium">Recebedor</th>
            <th className="px-2 py-2 font-medium">Código</th>
            <th className="px-2 py-2 font-medium min-w-[12rem]">Descrição</th>
            <th className="px-2 py-2 font-medium text-right">Qtd</th>
            <th className="px-2 py-2 font-medium text-right">Vlr total</th>
            <th className="px-2 py-2 font-medium">Necessidade</th>
            {controleResultado && <th className="px-2 py-2 font-medium">Resultado</th>}
            <th className="px-2 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ nota, item }) => (
            <tr key={`${nota.id}:${item.id}`} className="border-t border-ink-100">
              <td className="px-2 py-1.5 text-ink-600 whitespace-nowrap">
                {nota.dataEmissao ? new Date(`${nota.dataEmissao}T00:00:00`).toLocaleDateString('pt-BR') : '—'}
              </td>
              <td className="px-2 py-1.5 font-mono text-ink-800">{nota.numeroNfe}</td>
              <td className="px-2 py-1.5 text-ink-600">{nota.recebedor || '—'}</td>
              <td className="px-2 py-1.5 font-mono text-ink-700">{item.codigo || '—'}</td>
              <td className="px-2 py-1.5 text-ink-800">{item.descricao || '—'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-ink-700 whitespace-nowrap">
                {formatarNumeroCurtoBR(item.quantidade, 4)} {item.unidade}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-ink-900">{formatCurrency(item.valorTotal)}</td>
              <td className="px-2 py-1.5">
                <BadgeNecessidade valor={necessidadeEfetiva(item, nota)} herdada={!item.necessidade} />
                {!necessidadeEfetiva(item, nota) && <span className="text-ink-300">—</span>}
              </td>
              {controleResultado && (
                <td className="px-2 py-1.5">
                  <BadgeResultado
                    valor={resultadoDoItem(item, nota)}
                    herdado={!item.resultado}
                    parcial={textoQuantidadeFaturada(item, partesDoItem(item, nota).qtdFaturada)}
                  />
                  {!resultadoDoItem(item, nota) && <span className="text-ink-300">—</span>}
                </td>
              )}
              <td className="px-2 py-1.5">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                  style={{ backgroundColor: corDoStatus(nota.status), color: corTexto(corDoStatus(nota.status)) }}
                >
                  {nota.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-200 bg-ink-50 text-xs font-semibold text-ink-800">
            <td colSpan={5} className="px-2 py-2">
              {linhas.length} linha{linhas.length > 1 ? 's' : ''} de produto
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{formatarNumeroCurtoBR(totalQtd, 4)}</td>
            <td className="px-2 py-2 text-right font-mono tabular-nums">{formatCurrency(totalValor)}</td>
            <td colSpan={controleResultado ? 3 : 2} />
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------------------------
export function RegistroNotasPage({ currentAdmin, config }: { currentAdmin: string; config: ConfigRegistroNotas }) {
  const { prefixoChave } = config
  const controleResultado = !!config.controleResultado
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  // "recebedor" é a mesma Empresa cadastrada em Configurações/Frete — usada pra casar o
  // destinatário da NF-e pelo CNPJ ao importar o XML/PDF
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filtroNecessidade, setFiltroNecessidade] = useEstadoPersistente(`${prefixoChave}:filtroNecessidade`, '')
  const [filtroResultadoSalvo, setFiltroResultado] = useEstadoPersistente(`${prefixoChave}:filtroResultado`, '')
  const filtroResultado = controleResultado ? filtroResultadoSalvo : ''
  const [visao, setVisao] = useEstadoPersistente<'notas' | 'itens'>(`${prefixoChave}:visaoLista`, 'notas')
  // persistido (não só useState): o registro é preenchido aos poucos, muitas vezes intercalando
  // com outras abas (conferir um fornecedor, importar um XML de outra tela…) — sem isso, trocar de
  // aba e voltar desmonta a página e perde tudo que ainda não tinha sido salvo. Isso vale tanto pra
  // um registro novo em andamento quanto pra uma edição em curso.
  const [form, setForm] = useEstadoPersistente<DadosNota>(`${prefixoChave}:formRascunho`, DEFAULT_NOTA_FISCAL)
  const [statusInicial, setStatusInicial] = useEstadoPersistente<NotaFiscalStatus>(
    `${prefixoChave}:statusInicialRascunho`,
    NOTA_FISCAL_STATUSES[0],
  )
  const [editingId, setEditingId] = useEstadoPersistente<string | undefined>(`${prefixoChave}:editingIdRascunho`, undefined)
  const [saving, setSaving] = useState(false)
  const [coresStatus, setCoresStatus] = useState<Record<string, string>>({})
  const [formRecolhido, setFormRecolhido] = useEstadoPersistente(`${prefixoChave}:formRecolhido`, true)
  const [notaParaStatus, setNotaParaStatus] = useState<NotaFiscal | null>(null)
  const [importandoArquivo, setImportandoArquivo] = useState(false)
  // faz o DateField (Data de emissão) — que é não-controlado — remontar e pegar o valor certo
  // quando o formulário é repopulado por fora (trocar de registro, cancelar, importar arquivo).
  // Muda só nesses momentos, nunca durante a digitação normal do usuário.
  const [formResetKey, setFormResetKey] = useState(0)

  const itensForm = form.itens ?? []
  const necessidadeForm = form.necessidade ?? ''
  const resultadoForm: ResultadoTransferencia = form.resultado ?? ''

  async function refresh() {
    setLoading(true)
    try {
      setNotas(await config.listar())
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao carregar notas fiscais do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    listFornecedores()
      .then(setFornecedores)
      .catch(() => {
        // sugestão é só um extra — se o servidor estiver fora, o campo continua livre normalmente
      })
    listEmpresas()
      .then(setEmpresas)
      .catch(() => {
        // usada só pra casar o CNPJ ao importar — sem servidor, a importação cai pro nome da nota
      })
    getStatusColors()
      .then(setCoresStatus)
      .catch(() => {
        // cores customizadas são só um extra visual — se o servidor falhar, usa a paleta padrão
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function corDoStatus(status: string): string {
    return coresStatus[status] || corPadraoDoStatus(status, NOTA_FISCAL_STATUSES)
  }

  // necessidades digitadas à mão ("Outra…") já usadas em alguma nota — viram opção da lista também
  const necessidadesExtras = useMemo(() => {
    const fixas = new Set(NECESSIDADES_TRANSFERENCIA.map((n) => n.value))
    const extras = new Set<string>()
    const considerar = (v: string | undefined) => {
      if (v && !fixas.has(v)) extras.add(v)
    }
    for (const n of [...notas, { ...form } as Pick<NotaFiscal, 'necessidade' | 'itens'>]) {
      considerar(n.necessidade)
      for (const item of itensDaNota(n)) considerar(item.necessidade)
    }
    return Array.from(extras).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [notas, form])

  async function handleStatusChange(nota: NotaFiscal, novoStatus: NotaFiscalStatus) {
    try {
      await config.atualizarStatus(nota.id, novoStatus)
      await refresh()
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  async function handleSelecionarStatus(status: NotaFiscalStatus) {
    if (!notaParaStatus) return
    const nota = notaParaStatus
    setNotaParaStatus(null)
    await handleStatusChange(nota, status)
  }

  // marcar faturado / parado no estoque direto da lista: regrava a nota só com essa mudança (status,
  // histórico e quem criou continuam os mesmos — ver config.salvar)
  const handleMarcarResultado: MarcarResultado = async (nota, alvo) => {
    const dados = dadosDaNota(nota)
    // a quantidade faturada só vale pro parcialmente faturado — os outros resultados limpam
    const marcarItem = (i: NotaFiscalItem): NotaFiscalItem =>
      i.id === alvo.itemId
        ? { ...i, resultado: alvo.resultado, quantidadeFaturada: alvo.resultado === 'PARCIAL' ? alvo.quantidadeFaturada : undefined }
        : i
    const atualizados: DadosNota = alvo.itemId
      ? { ...dados, itens: itensDaNota(nota).map(marcarItem) }
      : { ...dados, resultado: alvo.resultado }
    try {
      const salva = await config.salvar(atualizados, nota.criadoPor, nota.id)
      setNotas((prev) => prev.map((x) => (x.id === salva.id ? salva : x)))
      // a nota aberta no formulário (editando) acompanha, pra um "Salvar alterações" depois não desfazer a marcação
      if (editingId === nota.id) {
        setForm((prev) =>
          alvo.itemId ? { ...prev, itens: (prev.itens ?? []).map(marcarItem) } : { ...prev, resultado: alvo.resultado },
        )
      }
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    }
  }

  function patch(p: Partial<DadosNota>) {
    setForm((prev) => ({ ...prev, ...p }))
  }

  function patchDeNota(dados: DadosExtraidosNotaFiscal): Partial<DadosNota> {
    return {
      ...(dados.numeroNfe ? { numeroNfe: dados.numeroNfe } : {}),
      ...(dados.dataEmissao ? { dataEmissao: dados.dataEmissao } : {}),
      ...(dados.valorNota !== undefined ? { valorNota: dados.valorNota } : {}),
      ...(dados.valorFrete !== undefined ? { valorFrete: dados.valorFrete } : {}),
      ...(dados.fornecedor ? { fornecedor: dados.fornecedor } : {}),
      ...(dados.recebedor ? { recebedor: dados.recebedor } : {}),
      ...(dados.transportadora ? { transportadora: dados.transportadora } : {}),
      ...(dados.itens && dados.itens.length > 0 ? { itens: dados.itens.map(itemDeExtraido) } : {}),
    }
  }

  // Aceita a NF-e (PDF ou XML) e o XML do frete (CT-e) juntos, no mesmo campo — cada arquivo
  // selecionado é identificado sozinho (pela extensão/tipo, e no caso do XML, pela raiz do
  // documento) e cai pro extrator certo. Dá pra soltar os dois de uma vez (multi-seleção) ou um de
  // cada vez, tanto faz.
  async function handleImportarArquivos(arquivos: FileList) {
    const lista = Array.from(arquivos)
    if (lista.length === 0) return
    setImportandoArquivo(true)
    const erros: string[] = []
    const avisosLeitura: string[] = []
    let patchNota: Partial<DadosNota> = {}
    let patchFrete: Partial<DadosNota> = {}
    const cadastros = {
      fornecedores: fornecedores.map((f) => ({ nome: f.nome, cnpj: f.cnpj })),
      empresas: empresas.map((e) => ({ nome: e.nome, cnpj: e.cnpj })),
      transportadorasConhecidas: TRANSPORTADORAS,
    }
    try {
      for (const file of lista) {
        const ehXml = /\.xml$/i.test(file.name) || file.type.includes('xml')
        const ehPdf = /\.pdf$/i.test(file.name) || file.type.includes('pdf')
        const ehImagem = /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name) || file.type.startsWith('image/')
        if (ehPdf || ehImagem) {
          try {
            const dados = ehPdf
              ? await extrairDadosNotaFiscalPdf(file, cadastros)
              : await extrairDadosNotaFiscalImagem(file, cadastros)
            const { avisoLeitura, ...campos } = dados
            if (avisoLeitura) avisosLeitura.push(`${file.name}: ${avisoLeitura}`)
            if (Object.keys(campos).length === 0) erros.push(`${file.name}: não consegui reconhecer os dados dessa nota.`)
            else patchNota = { ...patchNota, ...patchDeNota(campos) }
          } catch (err) {
            erros.push(`${file.name}: ${err instanceof Error ? err.message : 'erro ao ler o arquivo.'}`)
          }
          continue
        }
        if (!ehXml) {
          erros.push(
            `${file.name}: formato não reconhecido — envie o PDF (DANFE), uma foto da DANFE, o XML da NF-e ou o XML do CT-e.`,
          )
          continue
        }
        const xmlTexto = await file.text()
        const tipo = tipoDoXml(xmlTexto)
        if (tipo === 'nfe') {
          try {
            const dados = interpretarXmlNotaFiscal(xmlTexto, cadastros)
            if (Object.keys(dados).length === 0) erros.push(`${file.name}: não consegui reconhecer os dados dessa nota.`)
            else patchNota = { ...patchNota, ...patchDeNota(dados) }
          } catch (err) {
            erros.push(`${file.name}: ${err instanceof Error ? err.message : 'erro ao ler o XML.'}`)
          }
        } else if (tipo === 'cte') {
          try {
            const dados = interpretarXmlFrete(xmlTexto, { transportadorasConhecidas: TRANSPORTADORAS })
            if (Object.keys(dados).length === 0) erros.push(`${file.name}: não consegui reconhecer os dados desse frete.`)
            else patchFrete = { ...patchFrete, ...patchDeNota(dados) }
          } catch (err) {
            erros.push(`${file.name}: ${err instanceof Error ? err.message : 'erro ao ler o XML do frete.'}`)
          }
        } else {
          erros.push(`${file.name}: não parece ser o XML de uma NF-e nem de um CT-e.`)
        }
      }

      // o CT-e vence em transportadora/valor do frete de propósito — é o documento específico do
      // frete, mais confiável que o que a NF-e eventualmente também traga desses dois campos
      const patchFinal = { ...patchNota, ...patchFrete }
      if (Object.keys(patchFinal).length > 0) {
        if (patchFinal.itens && itensForm.length > 0) {
          const substituir = await confirmar(
            `A nota importada traz ${patchFinal.itens.length} produto(s). Substituir os ${itensForm.length} que já estão no formulário?`,
            { confirmText: 'Substituir', cancelText: 'Manter os atuais' },
          )
          if (!substituir) delete patchFinal.itens
        }
        patch(patchFinal)
        setFormRecolhido(false)
        setFormResetKey((k) => k + 1)
      }
      const mensagens = [...erros, ...avisosLeitura]
      if (mensagens.length > 0) void avisar(mensagens.join('\n'))
    } finally {
      setImportandoArquivo(false)
    }
  }

  function handleCancelEdit() {
    setForm(DEFAULT_NOTA_FISCAL)
    setStatusInicial(NOTA_FISCAL_STATUSES[0])
    setEditingId(undefined)
    setFormResetKey((k) => k + 1)
  }

  async function handleSubmit() {
    if (!form.numeroNfe.trim()) {
      void avisar('Informe o número da NF-e.')
      return
    }
    // produto sem código nem descrição não identifica nada — sai antes de salvar
    const itensValidos = itensForm
      .filter((i) => i.codigo.trim() || i.descricao.trim())
      // parcialmente faturado com a quantidade toda (ou mais) é faturado; sem resultado parcial, a quantidade faturada não vale
      .map((i): NotaFiscalItem => {
        if (i.resultado !== 'PARCIAL') return { ...i, quantidadeFaturada: undefined }
        if (i.quantidade > 0 && (i.quantidadeFaturada ?? 0) >= i.quantidade) return { ...i, resultado: 'FATURADO', quantidadeFaturada: undefined }
        return i
      })
    if (controleResultado) {
      const parcialSemQuantidade = itensValidos.find((i) => i.resultado === 'PARCIAL' && !((i.quantidadeFaturada ?? 0) > 0))
      if (parcialSemQuantidade) {
        void avisar(
          `Informe quantas unidades foram faturadas do produto parcialmente faturado (${parcialSemQuantidade.codigo || parcialSemQuantidade.descricao}).`,
        )
        return
      }
    }
    const semQuantidade = itensValidos.filter((i) => !(i.quantidade > 0))
    if (semQuantidade.length > 0) {
      const continuar = await confirmar(
        `${semQuantidade.length} produto(s) estão sem quantidade (ex.: ${semQuantidade[0].codigo || semQuantidade[0].descricao}). Salvar mesmo assim?`,
        { confirmText: 'Salvar assim', cancelText: 'Voltar e corrigir' },
      )
      if (!continuar) return
    }
    const duplicada = notas.find(
      (n) => n.id !== editingId && n.numeroNfe.trim().toLowerCase() === form.numeroNfe.trim().toLowerCase(),
    )
    if (duplicada) {
      const continuar = await confirmar(
        `Já existe uma nota registrada com o número "${form.numeroNfe.trim()}" (fornecedor: ${duplicada.fornecedor || '—'}). Deseja continuar mesmo assim?`,
      )
      if (!continuar) return
    }
    setSaving(true)
    try {
      await config.salvar(
        { ...form, necessidade: necessidadeForm, resultado: resultadoForm, itens: itensValidos },
        currentAdmin,
        editingId,
        statusInicial,
      )
      handleCancelEdit()
      await refresh()
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar a nota fiscal no servidor.')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(n: NotaFiscal) {
    setForm({
      numeroNfe: n.numeroNfe,
      fornecedor: n.fornecedor,
      recebedor: n.recebedor,
      transportadora: n.transportadora,
      valorNota: n.valorNota,
      valorFrete: n.valorFrete,
      dataEmissao: n.dataEmissao ?? '',
      tipo: n.tipo ?? 'PECAS',
      necessidade: n.necessidade ?? '',
      resultado: n.resultado ?? '',
      itens: itensDaNota(n).map((i) => ({ ...i })),
    })
    setEditingId(n.id)
    setFormRecolhido(false)
    setFormResetKey((k) => k + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string, e?: MouseEvent) {
    e?.stopPropagation()
    if (!(await confirmar('Excluir esta nota fiscal? Essa ação não pode ser desfeita.', { tone: 'danger', confirmText: 'Excluir' }))) return
    try {
      await config.excluir(id)
      if (editingId === id) handleCancelEdit()
      await refresh()
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao excluir a nota fiscal no servidor.')
    }
  }

  const fornecedorSuggestions = useMemo(() => fornecedores.map((f) => ({ value: f.id, label: f.nome })), [fornecedores])

  // --- filtros ------------------------------------------------------------------------------
  const termos = useMemo(
    () =>
      query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [query],
  )

  /** O resultado (efetivo) bate com o filtro de resultado escolhido? */
  function resultadoPassa(resultado: ResultadoTransferencia): boolean {
    if (!filtroResultado) return true
    return filtroResultado === FILTRO_SEM_RESULTADO ? !resultado : resultado === filtroResultado
  }

  function itemPassa(item: NotaFiscalItem, nota: NotaFiscal): boolean {
    const efetiva = necessidadeEfetiva(item, nota)
    if (filtroNecessidade === FILTRO_SEM_NECESSIDADE ? !!efetiva : filtroNecessidade && efetiva !== filtroNecessidade) return false
    if (!resultadoPassa(resultadoDoItem(item, nota))) return false
    if (termos.length === 0) return true
    const alvo = `${item.codigo} ${item.descricao} ${nota.numeroNfe} ${nota.fornecedor} ${nota.recebedor} ${nota.transportadora}`.toLowerCase()
    return termos.every((t) => alvo.includes(t))
  }

  function notaPassa(n: NotaFiscal): boolean {
    const itens = itensDaNota(n)
    // necessidade: a da nota, ou a de algum produto dela
    if (filtroNecessidade === FILTRO_SEM_NECESSIDADE) {
      if (n.necessidade || itens.some((i) => i.necessidade)) return false
    } else if (filtroNecessidade) {
      if (n.necessidade !== filtroNecessidade && !itens.some((i) => necessidadeEfetiva(i, n) === filtroNecessidade)) return false
    }
    // resultado: o da nota (sem produtos) ou o de algum produto dela
    if (filtroResultado) {
      const passa = itens.length === 0 ? resultadoPassa(resultadoDaNota(n)) : itens.some((i) => resultadoPassa(resultadoDoItem(i, n)))
      if (!passa) return false
    }
    if (termos.length === 0) return true
    const alvoNota = `${n.numeroNfe} ${n.fornecedor} ${n.recebedor} ${n.transportadora}`.toLowerCase()
    if (termos.every((t) => alvoNota.includes(t))) return true
    // ou algum produto da nota bate com a busca (código/descrição)
    return itens.some((i) => {
      const alvo = `${i.codigo} ${i.descricao} ${alvoNota}`.toLowerCase()
      return termos.every((t) => alvo.includes(t))
    })
  }

  const filtrosAtivos = termos.length > 0 || !!filtroNecessidade || !!filtroResultado
  const filtradas = useMemo(() => notas.filter(notaPassa), [notas, termos, filtroNecessidade, filtroResultado]) // eslint-disable-line react-hooks/exhaustive-deps

  const mesAtualKey = chaveMes(new Date())

  // lista principal: tudo do mês atual + tudo que ainda está em aberto, de qualquer mês — uma nota
  // em aberto não "some" pra dentro da pasta do mês dela enquanto não for concluída
  const notasPrincipais = useMemo(
    () => filtradas.filter((n) => chaveMesDaNota(n) === mesAtualKey || n.status !== STATUS_CONCLUIDO),
    [filtradas, mesAtualKey],
  )
  const gruposPrincipais = useMemo(() => agruparPorStatus(notasPrincipais), [notasPrincipais])
  const emAbertoAnteriores = notasPrincipais.filter((n) => chaveMesDaNota(n) !== mesAtualKey).length

  // pastas: só as concluídas de meses anteriores, agrupadas por ano — ficam pra sempre
  const pastasPorAno = useMemo(() => {
    const porMes = new Map<string, NotaFiscal[]>()
    for (const n of filtradas) {
      const chave = chaveMesDaNota(n)
      if (chave === mesAtualKey || n.status !== STATUS_CONCLUIDO) continue
      if (!porMes.has(chave)) porMes.set(chave, [])
      porMes.get(chave)!.push(n)
    }
    const meses = Array.from(porMes.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
    const anos = new Map<string, { mesKey: string; itens: NotaFiscal[] }[]>()
    for (const [mesKey, itens] of meses) {
      const ano = mesKey.slice(0, 4)
      if (!anos.has(ano)) anos.set(ano, [])
      anos.get(ano)!.push({ mesKey, itens })
    }
    return Array.from(anos.entries())
  }, [filtradas, mesAtualKey])
  const totalPastas = pastasPorAno.reduce((s, [, meses]) => s + meses.length, 0)

  // visão por produto
  const linhasItens = useMemo(() => {
    const linhas: { nota: NotaFiscal; item: NotaFiscalItem }[] = []
    for (const nota of notas) for (const item of itensDaNota(nota)) if (itemPassa(item, nota)) linhas.push({ nota, item })
    return linhas.sort(
      (a, b) =>
        (b.nota.dataEmissao || '').localeCompare(a.nota.dataEmissao || '') || b.nota.createdAt - a.nota.createdAt,
    )
  }, [notas, termos, filtroNecessidade, filtroResultado]) // eslint-disable-line react-hooks/exhaustive-deps

  const opcoesFiltroNecessidade = [
    { value: '', label: 'Todas as necessidades' },
    ...NECESSIDADES_TRANSFERENCIA,
    ...necessidadesExtras.map((n) => ({ value: n, label: n })),
    { value: FILTRO_SEM_NECESSIDADE, label: 'Sem necessidade definida' },
  ]

  return (
    <div className="space-y-6">
      <div className="card">
        <button
          type="button"
          onClick={() => setFormRecolhido((v) => !v)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              {config.tituloRegistro}
              {editingId && <span className="ml-2 text-xs font-medium text-ink-500">(editando)</span>}
            </h2>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-100 hover:border-ink-400 transition">
            {formRecolhido ? 'Expandir' : 'Recolher'}
            <span aria-hidden className={`transition-transform ${formRecolhido ? '' : 'rotate-180'}`}>
              ▾
            </span>
          </span>
        </button>

        {!formRecolhido && (
          <>
            <div className="mt-5 rounded-xl border border-dashed border-ink-200 p-4">
              <label className="block">
                <span className="field-label">
                  Importar nota (XML ou PDF da NF-e, ou foto da DANFE) e/ou XML do frete (CT-e) — pode selecionar mais de um
                  junto, preenche os campos e os produtos automaticamente
                </span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.xml,application/pdf,text/xml,application/xml,image/*"
                  disabled={importandoArquivo}
                  onChange={(e) => {
                    const files = e.target.files
                    if (files && files.length > 0) handleImportarArquivos(files)
                    e.target.value = ''
                  }}
                  className="field-input"
                />
              </label>
              {importandoArquivo && (
                <p className="text-xs text-ink-400 mt-2">Lendo o(s) arquivo(s)… PDF escaneado pode levar alguns segundos.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
              <TextField label="Número da NF-e" value={form.numeroNfe} onChange={(v) => patch({ numeroNfe: v })} />
              <DateField key={formResetKey} label="Data de emissão" value={form.dataEmissao} onChange={(v) => patch({ dataEmissao: v })} />
              <AutocompleteField
                label="Fornecedor"
                value={form.fornecedor}
                onChange={(v) => patch({ fornecedor: v })}
                suggestions={fornecedorSuggestions}
                onSelectSuggestion={(s) => patch({ fornecedor: s.label })}
              />
              <AutocompleteField
                label="Recebedor"
                value={form.recebedor}
                onChange={(v) => patch({ recebedor: v })}
                suggestions={recebedorSuggestions}
              />
              <AutocompleteField
                label="Transportadora"
                value={form.transportadora}
                onChange={(v) => patch({ transportadora: v })}
                suggestions={transportadoraSuggestions}
              />
              <NumberField
                label="Valor da nota fiscal"
                value={form.valorNota}
                onChange={(v) => patch({ valorNota: v })}
                prefix="R$"
                step={0.01}
                min={0}
              />
              <NumberField
                label="Valor do frete"
                value={form.valorFrete}
                onChange={(v) => patch({ valorFrete: v })}
                prefix="R$"
                step={0.01}
                min={0}
              />
              <SelectField
                label="Tipo"
                value={form.tipo}
                onChange={(v) => patch({ tipo: v as NotaFiscalTipo })}
                options={NOTA_FISCAL_TIPOS.map((t) => ({ value: t.value, label: t.label }))}
              />
              <label className="block">
                <span className="field-label">Necessidade da transferência</span>
                <SeletorNecessidade
                  valor={necessidadeForm}
                  onChange={(v) => patch({ necessidade: v })}
                  opcoesExtras={necessidadesExtras}
                  rotuloVazio="— não definida —"
                />
                <span className="mt-1 block text-xs text-ink-400">Vale pra todos os produtos da nota, menos os que tiverem a sua própria.</span>
              </label>
              {controleResultado && (
                <label className="block">
                  <span className="field-label">Resultado da transferência</span>
                  <SeletorResultado
                    valor={resultadoForm}
                    onChange={(v) => patch({ resultado: v })}
                    rotuloVazio="— ainda não se sabe —"
                  />
                  <span className="mt-1 block text-xs text-ink-400">
                    Faturado (virou venda) ou parado no estoque (prejuízo). Vale pra todos os produtos, menos os que
                    tiverem o seu próprio.
                  </span>
                </label>
              )}
              {!editingId && (
                <SelectField
                  label="Status inicial"
                  value={statusInicial}
                  onChange={(v) => setStatusInicial(v as NotaFiscalStatus)}
                  options={statusOptions}
                />
              )}
            </div>

            <ItensNotaEditor
              itens={itensForm}
              necessidadeNota={necessidadeForm}
              resultadoNota={resultadoForm}
              controleResultado={controleResultado}
              opcoesExtras={necessidadesExtras}
              onChange={(itens) => patch({ itens })}
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={handleSubmit} disabled={saving}>
                {editingId ? 'Salvar alterações' : 'Adicionar Novo Registro'}
              </Button>
              <Button variant="secondary" onClick={handleCancelEdit}>
                {editingId ? 'Cancelar edição' : 'Limpar dados'}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-lg font-semibold text-ink-900">{config.tituloLista}</h2>
          <div className="inline-flex rounded-lg border border-ink-200 p-0.5" role="tablist" aria-label="Visualização">
            {(
              [
                ['notas', 'Por nota'],
                ['itens', 'Por produto'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={visao === valor}
                onClick={() => setVisao(valor)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  visao === valor ? 'bg-ink-950 text-white' : 'text-ink-500 hover:bg-ink-100'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="text"
            className="field-input max-w-sm"
            placeholder="Buscar por NF-e, fornecedor, recebedor, transportadora, código ou descrição do produto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className={`field-input w-auto ${filtroNecessidade ? 'border-ink-400 bg-ink-100 font-semibold' : ''}`}
            value={filtroNecessidade}
            onChange={(e) => setFiltroNecessidade(e.target.value)}
            aria-label="Filtrar pela necessidade da transferência"
          >
            {opcoesFiltroNecessidade.map((o) => (
              <option key={o.value || 'todas'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {controleResultado && (
            <select
              className={`field-input w-auto ${filtroResultado ? 'border-ink-400 bg-ink-100 font-semibold' : ''}`}
              value={filtroResultado}
              onChange={(e) => setFiltroResultado(e.target.value)}
              aria-label="Filtrar pelo resultado da transferência"
            >
              <option value="">Todos os resultados</option>
              {RESULTADOS_DO_PRODUTO.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
              <option value={FILTRO_SEM_RESULTADO}>Sem resultado ainda</option>
            </select>
          )}
          {filtrosAtivos && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setFiltroNecessidade('')
                setFiltroResultado('')
              }}
              className="pill-tab border border-ink-200 py-1.5 text-xs text-ink-600 hover:bg-ink-50"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : visao === 'itens' ? (
          <ListaItensTransferidos linhas={linhasItens} corDoStatus={corDoStatus} controleResultado={controleResultado} />
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">
            {notas.length === 0 ? 'Nenhuma nota fiscal registrada ainda.' : 'Nada encontrado com esses filtros.'}
          </p>
        ) : (
          <>
            <p className="text-xs font-medium text-ink-400 mb-2">
              {labelDoMes(mesAtualKey)} (mês atual)
              {emAbertoAnteriores > 0 && ` + ${emAbertoAnteriores} em aberto de meses anteriores`}
            </p>
            {gruposPrincipais.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6 mb-2">Nenhuma nota do mês atual nem em aberto.</p>
            ) : (
              <div className="space-y-6 mb-2">
                {gruposPrincipais.map((grupo) => (
                  <GrupoStatusTable
                    key={grupo.status}
                    prefixoChave={prefixoChave}
                    grupo={grupo}
                    mesAtualKey={mesAtualKey}
                    corDoStatus={corDoStatus}
                    onEdit={handleEdit}
                    onAbrirStatus={setNotaParaStatus}
                    controleResultado={controleResultado}
                    onMarcarResultado={handleMarcarResultado}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!loading && visao === 'notas' && totalPastas > 0 && (
        <div className="card">
          <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Meses anteriores</h2>
          <p className="text-sm text-ink-400 mb-4">
            Notas já concluídas, guardadas na pasta do mês de referência — ficam aqui pra sempre, como histórico. Nota de um
            mês anterior que ainda está em aberto continua na lista de cima até ser concluída.
          </p>
          <div className="space-y-5">
            {pastasPorAno.map(([ano, meses]) => (
              <Fragment key={ano}>
                {pastasPorAno.length > 1 && <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{ano}</p>}
                <div className="space-y-3">
                  {meses.map((p) => (
                    <PastaMes
                      key={p.mesKey}
                      prefixoChave={prefixoChave}
                      mesKey={p.mesKey}
                      itens={p.itens}
                      mesAtualKey={mesAtualKey}
                      corDoStatus={corDoStatus}
                      onEdit={handleEdit}
                      onAbrirStatus={setNotaParaStatus}
                      controleResultado={controleResultado}
                      onMarcarResultado={handleMarcarResultado}
                    />
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {editingId && (
          <button
            type="button"
            onClick={() => handleDelete(editingId)}
            className="h-10 px-4 rounded-full bg-rose-600 text-white text-sm font-medium shadow-lg hover:bg-rose-500 transition"
          >
            Excluir
          </button>
        )}
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Voltar ao topo"
          title="Voltar ao topo"
          className="h-11 w-11 rounded-full bg-ink-950 text-white text-lg shadow-lg hover:bg-brand-600 transition flex items-center justify-center"
        >
          ↑
        </button>
      </div>

      {notaParaStatus && (
        <AlterarStatusModal
          nota={notaParaStatus}
          corDoStatus={corDoStatus}
          onSelecionar={handleSelecionarStatus}
          onFechar={() => setNotaParaStatus(null)}
        />
      )}
    </div>
  )
}
