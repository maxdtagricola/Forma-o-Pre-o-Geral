import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Button } from '../components/ui/Basics'
import { ImportarCotacaoFornecedorModal, type ItemImportadoConfirmado } from '../components/ImportarCotacaoFornecedorModal'
import { listFornecedores } from '../db/fornecedoresRepo'
import { formatCurrency, makeId, melhorCotacaoFornecedor, selecionarTudoAoFocar } from '../utils'
import { avisar } from '../dialogs'
import type { CotacaoFornecedorItem, Fornecedor, ProductInput, QuoteItem, QuoteStatus } from '../types'

const ID_LISTA_FORNECEDORES = 'comparar-fornecedores-sugestoes'
const TOTAL_COLUNAS = 8
const cellCls = 'px-1 py-1 border-t border-ink-100'
const inputCls =
  'w-full bg-transparent border-0 rounded px-1.5 py-1.5 text-ink-800 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-60'

/** "" -> undefined; texto numérico -> número (aceita vírgula). */
function numeroOuVazio(texto: string): number | undefined {
  if (!texto.trim()) return undefined
  const valor = Number(texto.replace(',', '.'))
  return Number.isFinite(valor) ? valor : undefined
}

/** Linha de uma cotação de fornecedor, editável direto na célula — igual às linhas de "Itens da
 * cotação". O valor total é opcional: vazio, mostra (em cinza) o unitário × quantidade do item. */
function LinhaCotacao({
  cotacao,
  qtdItem,
  menorValor,
  travadaPorOutro,
  onChange,
  onRemover,
}: {
  cotacao: CotacaoFornecedorItem
  qtdItem: number
  menorValor: number | undefined
  travadaPorOutro: boolean
  onChange: (patch: Partial<CotacaoFornecedorItem>) => void
  onRemover: () => void
}) {
  const melhor = menorValor !== undefined && cotacao.valorUnitario === menorValor
  const diferenca = menorValor !== undefined ? cotacao.valorUnitario - menorValor : 0
  const diferencaPct = menorValor ? (diferenca / menorValor) * 100 : 0
  return (
    <tr className={melhor ? 'bg-emerald-50/70' : 'hover:bg-ink-50'}>
      <td className={`${cellCls} text-center`}>
        {melhor && <span className="text-emerald-600" title="Mais barato desse item">★</span>}
      </td>
      <td className={cellCls}>
        <input
          className={`${inputCls} ${melhor ? 'font-semibold text-emerald-900' : ''}`}
          list={ID_LISTA_FORNECEDORES}
          value={cotacao.fornecedor}
          disabled={travadaPorOutro}
          onChange={(e) => onChange({ fornecedor: e.target.value })}
        />
      </td>
      <td className={cellCls}>
        <input
          className={inputCls}
          value={cotacao.marca}
          disabled={travadaPorOutro}
          onChange={(e) => onChange({ marca: e.target.value })}
        />
      </td>
      <td className={cellCls}>
        <input
          className={inputCls}
          placeholder="—"
          value={cotacao.prazoEntrega ?? ''}
          disabled={travadaPorOutro}
          onChange={(e) => onChange({ prazoEntrega: e.target.value })}
        />
      </td>
      <td className={cellCls}>
        <input
          type="number"
          min={0}
          step={0.01}
          className={`${inputCls} text-right tabular-nums ${melhor ? 'font-semibold text-emerald-900' : ''}`}
          value={cotacao.valorUnitario}
          disabled={travadaPorOutro}
          onChange={(e) => onChange({ valorUnitario: Number(e.target.value) || 0 })}
          onFocus={selecionarTudoAoFocar}
        />
      </td>
      <td className={cellCls}>
        <input
          type="number"
          min={0}
          step={0.01}
          className={`${inputCls} text-right tabular-nums`}
          placeholder={formatCurrency(cotacao.valorUnitario * qtdItem)}
          title={cotacao.valorTotal === undefined ? 'Vazio: vale o valor unitário × quantidade do item' : 'Valor total informado pelo fornecedor'}
          value={cotacao.valorTotal ?? ''}
          disabled={travadaPorOutro}
          onChange={(e) => onChange({ valorTotal: numeroOuVazio(e.target.value) })}
          onFocus={selecionarTudoAoFocar}
        />
      </td>
      <td className={`${cellCls} text-right text-xs tabular-nums pr-2`}>
        {melhor ? (
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">Melhor preço</span>
        ) : menorValor !== undefined ? (
          <span className="text-rose-600">
            +{formatCurrency(diferenca)} <span className="text-rose-400">(+{diferencaPct.toFixed(1).replace('.', ',')}%)</span>
          </span>
        ) : null}
      </td>
      <td className={`${cellCls} text-center`}>
        <button
          type="button"
          onClick={onRemover}
          disabled={travadaPorOutro}
          aria-label="Remover cotação"
          className="h-6 w-6 rounded-full text-xs leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition disabled:opacity-60"
        >
          ×
        </button>
      </td>
    </tr>
  )
}

/** Linha "em branco" no fim de cada item, pra digitar uma cotação nova direto na tabela. */
function LinhaNovaCotacao({ qtdItem, onAdicionar }: { qtdItem: number; onAdicionar: (c: Omit<CotacaoFornecedorItem, 'id'>) => void }) {
  const [fornecedor, setFornecedor] = useState('')
  const [marca, setMarca] = useState('')
  const [prazo, setPrazo] = useState('')
  const [valorUnitario, setValorUnitario] = useState('')
  const [valorTotal, setValorTotal] = useState('')

  function handleAdicionar() {
    const unitario = numeroOuVazio(valorUnitario)
    if (!fornecedor.trim()) {
      void avisar('Informe o fornecedor.')
      return
    }
    if (!unitario || unitario <= 0) {
      void avisar('Informe o valor unitário cotado.')
      return
    }
    const total = numeroOuVazio(valorTotal)
    onAdicionar({
      fornecedor: fornecedor.trim(),
      marca: marca.trim(),
      valorUnitario: unitario,
      ...(total !== undefined && total > 0 ? { valorTotal: total } : {}),
      ...(prazo.trim() ? { prazoEntrega: prazo.trim() } : {}),
    })
    setFornecedor('')
    setMarca('')
    setPrazo('')
    setValorUnitario('')
    setValorTotal('')
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === 'Enter') handleAdicionar()
  }

  const unitarioDigitado = numeroOuVazio(valorUnitario) ?? 0
  const novoCls = 'w-full rounded border border-dashed border-ink-200 bg-surface px-1.5 py-1 text-ink-800 focus:outline-none focus:ring-1 focus:ring-brand-400'
  return (
    <tr className="bg-ink-50/40">
      <td className={`${cellCls} text-center text-ink-300`}>+</td>
      <td className={cellCls}>
        <input className={novoCls} list={ID_LISTA_FORNECEDORES} placeholder="Novo fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} onKeyDown={aoTeclar} />
      </td>
      <td className={cellCls}>
        <input className={novoCls} placeholder="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} onKeyDown={aoTeclar} />
      </td>
      <td className={cellCls}>
        <input className={novoCls} placeholder="Prazo" value={prazo} onChange={(e) => setPrazo(e.target.value)} onKeyDown={aoTeclar} />
      </td>
      <td className={cellCls}>
        <input
          className={`${novoCls} text-right tabular-nums`}
          inputMode="decimal"
          placeholder="R$ unit."
          value={valorUnitario}
          onChange={(e) => setValorUnitario(e.target.value)}
          onKeyDown={aoTeclar}
        />
      </td>
      <td className={cellCls}>
        <input
          className={`${novoCls} text-right tabular-nums`}
          inputMode="decimal"
          placeholder={unitarioDigitado > 0 ? formatCurrency(unitarioDigitado * qtdItem) : 'R$ total'}
          value={valorTotal}
          onChange={(e) => setValorTotal(e.target.value)}
          onKeyDown={aoTeclar}
        />
      </td>
      <td colSpan={2} className={`${cellCls} text-right pr-2`}>
        <button
          type="button"
          onClick={handleAdicionar}
          className="rounded-lg border border-ink-200 bg-surface px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
        >
          Adicionar
        </button>
      </td>
    </tr>
  )
}

/**
 * Compara cotações de fornecedores por item da cotação — direto em cima dos itens reais (ver
 * QuoteItem). Organizado como uma planilha única, no mesmo jeitão de "Itens da cotação": cada item
 * vira um bloco com cabeçalho próprio, e as cotações dele ficam embaixo, editáveis direto na célula.
 * A cada cotação adicionada/editada/removida, a mais barata já atualiza fornecedor/marca/valor
 * unitário (e prazo, se informado) do item automaticamente (via onPatchItem, o mesmo callback usado
 * em "Itens da cotação"), então não existe um passo separado de "aplicar" ou "salvar" aqui.
 */
export function CompararFornecedoresPage({
  currentAdmin,
  isEditing,
  activeStatus,
  activeResponsavel,
  items,
  onPatchItem,
  onGoToCotacoes,
  onGoToPrecificacao,
}: {
  currentAdmin: string
  isEditing: boolean
  activeStatus: QuoteStatus
  activeResponsavel: string
  items: QuoteItem[]
  onPatchItem: (id: string, patch: Partial<ProductInput>) => void
  onGoToCotacoes: () => void
  onGoToPrecificacao: () => void
}) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [importAberto, setImportAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [soSemCotacao, setSoSemCotacao] = useState(false)

  useEffect(() => {
    listFornecedores()
      .then(setFornecedores)
      .catch(() => {
        // sugestão é só um extra — se o servidor estiver fora, o campo continua livre normalmente
      })
  }, [])

  const travadaPorOutro = activeStatus !== 'PENDENTE' && !!activeResponsavel && activeResponsavel !== currentAdmin
  const fornecedorSuggestions = fornecedores.map((f) => ({ value: f.id, label: f.nome }))

  // fornecedores que já aparecem em alguma cotação dessa tela — opções do filtro
  const fornecedoresCotados = useMemo(() => {
    const nomes = new Map<string, string>()
    for (const item of items) {
      for (const c of item.product.cotacoesFornecedores ?? []) {
        const nome = c.fornecedor.trim()
        if (nome && !nomes.has(nome.toUpperCase())) nomes.set(nome.toUpperCase(), nome)
      }
    }
    return Array.from(nomes.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [items])

  function aplicarCotacoes(itemId: string, cotacoes: CotacaoFornecedorItem[]) {
    const melhor = melhorCotacaoFornecedor(cotacoes.filter((c) => c.valorUnitario > 0))
    onPatchItem(itemId, {
      cotacoesFornecedores: cotacoes,
      ...(melhor
        ? {
            valorUnt: melhor.valorUnitario,
            fornecedor: melhor.fornecedor,
            marca: melhor.marca,
            ...(melhor.prazoEntrega ? { prazoEntrega: melhor.prazoEntrega } : {}),
          }
        : {}),
    })
  }

  function handleAddCotacao(item: QuoteItem, cotacao: Omit<CotacaoFornecedorItem, 'id'>) {
    aplicarCotacoes(item.id, [...(item.product.cotacoesFornecedores ?? []), { ...cotacao, id: makeId() }])
  }

  function handleEditarCotacao(item: QuoteItem, cotacaoId: string, patch: Partial<CotacaoFornecedorItem>) {
    aplicarCotacoes(
      item.id,
      (item.product.cotacoesFornecedores ?? []).map((c) => (c.id === cotacaoId ? { ...c, ...patch } : c)),
    )
  }

  function handleRemoveCotacao(item: QuoteItem, cotacaoId: string) {
    aplicarCotacoes(
      item.id,
      (item.product.cotacoesFornecedores ?? []).filter((c) => c.id !== cotacaoId),
    )
  }

  // vindo do modal de importação — um lote de itens que podem pertencer a QuoteItems diferentes,
  // cada um recebe a mesma cotação (fornecedor/marca), com o valor unitário e (se o arquivo trazia)
  // o valor total mudando por item
  function handleImportarConfirmado(fornecedorNome: string, marca: string, confirmados: ItemImportadoConfirmado[]) {
    for (const c of confirmados) {
      const item = items.find((i) => i.id === c.itemId)
      if (!item) continue
      handleAddCotacao(item, {
        fornecedor: fornecedorNome,
        // marca lida do próprio arquivo (coluna MARCA) vale mais que a marca geral digitada
        marca: c.marca || marca,
        valorUnitario: c.valorUnitario,
        ...(c.valorTotal !== undefined ? { valorTotal: c.valorTotal } : {}),
        ...(c.prazoEntrega ? { prazoEntrega: c.prazoEntrega } : {}),
      })
    }
  }

  const termo = busca.trim().toLowerCase()
  const itensVisiveis = items
    .map((item, i) => ({ item, numero: i + 1 }))
    .filter(({ item }) => {
      const p = item.product
      const cotacoes = p.cotacoesFornecedores ?? []
      if (soSemCotacao && cotacoes.length > 0) return false
      if (filtroFornecedor && !cotacoes.some((c) => c.fornecedor.trim().toUpperCase() === filtroFornecedor.toUpperCase())) return false
      if (termo && ![p.interno, p.referencia, p.descricao, p.marca].some((v) => v.toLowerCase().includes(termo))) return false
      return true
    })
  const filtrosAtivos = !!termo || !!filtroFornecedor || soSemCotacao
  const semCotacao = items.filter((i) => (i.product.cotacoesFornecedores ?? []).length === 0).length

  if (!isEditing) {
    return (
      <div className="card text-center py-16">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Nenhuma cotação aberta</h2>
        <p className="text-sm text-ink-400 mb-5">Crie ou abra uma cotação na aba Cotações pra comparar fornecedores.</p>
        <Button variant="primary" onClick={onGoToCotacoes}>
          Ir para Cotações
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {travadaPorOutro && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Esta cotação está sendo analisada por <strong>{activeResponsavel}</strong> — só ele(a) pode alterá-la agora.
          </p>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Comparar fornecedores</h2>
            <p className="text-sm text-ink-400">
              Registre as cotações que os fornecedores devolverem — edite direto na tabela. A mais barata de cada item
              (★) já atualiza o fornecedor, a marca, o valor unitário e o prazo do item automaticamente.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {!travadaPorOutro && items.length > 0 && (
              <Button variant="secondary" onClick={() => setImportAberto(true)}>
                Importar cotação (planilha, PDF, foto…)
              </Button>
            )}
            <Button variant="ghost" onClick={onGoToPrecificacao}>
              Voltar para Precificação
            </Button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="text"
              className="field-input w-64 py-1.5 text-sm"
              placeholder="Buscar item (interno, referência, descrição…)"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select
              className={`field-input w-56 py-1.5 text-sm ${filtroFornecedor ? 'border-brand-400 bg-brand-50 font-semibold' : ''}`}
              value={filtroFornecedor}
              onChange={(e) => setFiltroFornecedor(e.target.value)}
              title="Mostrar só as cotações desse fornecedor"
            >
              <option value="">Todos os fornecedores</option>
              {fornecedoresCotados.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-sm text-ink-600">
              <input type="checkbox" checked={soSemCotacao} onChange={(e) => setSoSemCotacao(e.target.checked)} />
              Só itens sem cotação ({semCotacao})
            </label>
            {filtrosAtivos && (
              <>
                <span className="text-xs text-ink-500">
                  Mostrando <strong className="text-ink-900">{itensVisiveis.length}</strong> de {items.length} itens
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBusca('')
                    setFiltroFornecedor('')
                    setSoSemCotacao(false)
                  }}
                  className="pill-tab border border-ink-200 py-1 text-xs text-ink-600 hover:bg-ink-50"
                >
                  Limpar filtros
                </button>
              </>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-10">
            Nenhum item registrado ainda — volte em "Itens da cotação" pra adicionar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <datalist id={ID_LISTA_FORNECEDORES}>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.nome} />
              ))}
            </datalist>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-ink-50 text-left text-ink-400">
                  <th className="py-2 px-2 w-8"></th>
                  <th className="py-2 px-2 font-medium min-w-[12rem]">Fornecedor</th>
                  <th className="py-2 px-2 font-medium min-w-[8rem]">Marca</th>
                  <th className="py-2 px-2 font-medium min-w-[7rem]">Prazo</th>
                  <th className="py-2 px-2 font-medium w-32 text-right">Valor unt.</th>
                  <th className="py-2 px-2 font-medium w-32 text-right">Valor total</th>
                  <th className="py-2 px-2 font-medium w-40 text-right">Dif. p/ melhor</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {itensVisiveis.length === 0 && (
                  <tr>
                    <td colSpan={TOTAL_COLUNAS} className="py-6 text-center text-sm text-ink-400 border-t border-ink-100">
                      Nenhum item com esses filtros.
                    </td>
                  </tr>
                )}
                {itensVisiveis.map(({ item, numero }) => {
                  const p = item.product
                  const todas = p.cotacoesFornecedores ?? []
                  const validas = todas.filter((c) => c.valorUnitario > 0)
                  const menorValor = validas.length > 0 ? Math.min(...validas.map((c) => c.valorUnitario)) : undefined
                  const melhor = melhorCotacaoFornecedor(validas)
                  const cotacoesVisiveis = filtroFornecedor
                    ? todas.filter((c) => c.fornecedor.trim().toUpperCase() === filtroFornecedor.toUpperCase())
                    : todas
                  return (
                    <Fragment key={item.id}>
                      <tr className="bg-ink-100/70">
                        <td className="px-2 py-2 border-t-2 border-ink-200 text-center text-xs text-ink-400">{numero}</td>
                        <td colSpan={TOTAL_COLUNAS - 1} className="px-2 py-2 border-t-2 border-ink-200">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-display font-semibold text-ink-900">
                                {p.referencia || '(sem referência)'}
                              </span>
                              {p.interno && <span className="ml-2 font-mono text-xs text-ink-500">Interno {p.interno}</span>}
                              <span className="ml-2 text-ink-600">{p.descricao || '—'}</span>
                              <span className="ml-2 text-xs text-ink-500">
                                · Qtd <strong className="text-ink-800">{p.qtd}</strong>
                                {p.ncm ? <> · NCM <span className="font-mono">{p.ncm}</span></> : null}
                                {' '}· {todas.length} cotaç{todas.length === 1 ? 'ão' : 'ões'}
                              </span>
                            </div>
                            {melhor ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-800">
                                Melhor: <strong className="font-mono tabular-nums">{formatCurrency(melhor.valorUnitario)}</strong>
                                · {melhor.fornecedor}
                                <span className="text-emerald-600">
                                  (total {formatCurrency(melhor.valorTotal ?? melhor.valorUnitario * (p.qtd || 0))})
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-amber-700">Sem cotação ainda</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {cotacoesVisiveis.map((c) => (
                        <LinhaCotacao
                          key={c.id}
                          cotacao={c}
                          qtdItem={p.qtd || 0}
                          menorValor={menorValor}
                          travadaPorOutro={travadaPorOutro}
                          onChange={(patch) => handleEditarCotacao(item, c.id, patch)}
                          onRemover={() => handleRemoveCotacao(item, c.id)}
                        />
                      ))}
                      {!travadaPorOutro && (
                        <LinhaNovaCotacao qtdItem={p.qtd || 0} onAdicionar={(c) => handleAddCotacao(item, c)} />
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {importAberto && (
        <ImportarCotacaoFornecedorModal
          items={items}
          fornecedorSuggestions={fornecedorSuggestions}
          fornecedores={fornecedores.map((f) => ({ nome: f.nome, cnpj: f.cnpj }))}
          onConfirmar={handleImportarConfirmado}
          onClose={() => setImportAberto(false)}
        />
      )}
    </div>
  )
}
