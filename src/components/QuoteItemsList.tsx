import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { formatCurrency, selecionarTudoAoFocar } from '../utils'
import { calculateItem } from '../calc/calculator'
import { ESTADOS } from '../data/estados'
import { listFornecedores } from '../db/fornecedoresRepo'
import { findByInterno, findByReferencia } from '../db/analysesRepo'
import { PlanilhaFornecedorModal } from './PlanilhaFornecedorModal'
import { Button } from './ui/Basics'
import { avisar } from '../dialogs'
import type { Fornecedor, ProductInput, QuoteItem } from '../types'

type ModoFrete = 'pct' | 'valor'

type ColunaKey =
  | 'interno'
  | 'referencia'
  | 'descricao'
  | 'ncm'
  | 'fornecedor'
  | 'uf'
  | 'qtd'
  | 'peso'
  | 'valorUnt'
  | 'precoVenda'
  | 'frete'
  | 'prazo'
  | 'total'

const COLUNAS_PADRAO: ColunaKey[] = [
  'interno',
  'referencia',
  'descricao',
  'ncm',
  'fornecedor',
  'uf',
  'qtd',
  'peso',
  'valorUnt',
  'precoVenda',
  'frete',
  'prazo',
  'total',
]

const LABEL_COLUNA: Record<ColunaKey, string> = {
  interno: 'Interno',
  referencia: 'Referência',
  descricao: 'Descrição',
  ncm: 'NCM',
  fornecedor: 'Fornecedor',
  uf: 'UF',
  qtd: 'Qtd',
  peso: 'Peso (kg)',
  valorUnt: 'Valor unt.',
  precoVenda: 'Preço de venda',
  frete: 'Frete',
  prazo: 'Prazo',
  total: 'Total',
}

const CLASSE_COLUNA: Record<ColunaKey, string> = {
  interno: 'min-w-[7rem]',
  referencia: 'min-w-[8rem]',
  descricao: 'min-w-[12rem]',
  ncm: 'min-w-[7rem]',
  fornecedor: 'min-w-[10rem]',
  uf: 'w-24',
  qtd: 'w-20 text-right',
  peso: 'w-24 text-right',
  valorUnt: 'w-28 text-right',
  precoVenda: 'w-28 text-right',
  frete: 'w-32',
  prazo: 'min-w-[7rem]',
  total: 'w-32 text-right',
}

// preferência só de exibição (não é dado da cotação) — guardada no navegador de quem está usando,
// pra continuar do jeito que a pessoa deixou da última vez
const CHAVE_ORDEM_COLUNAS = 'itensCotacao:ordemColunas'

function carregarOrdemColunas(): ColunaKey[] {
  try {
    const bruto = localStorage.getItem(CHAVE_ORDEM_COLUNAS)
    if (!bruto) return COLUNAS_PADRAO
    const salvo = JSON.parse(bruto)
    // só aceita se tiver exatamente o mesmo conjunto de colunas de hoje — evita ordem quebrada se
    // uma coluna for adicionada/removida numa atualização futura do app
    const valido = Array.isArray(salvo) && salvo.length === COLUNAS_PADRAO.length && COLUNAS_PADRAO.every((c) => salvo.includes(c))
    return valido ? (salvo as ColunaKey[]) : COLUNAS_PADRAO
  } catch {
    return COLUNAS_PADRAO
  }
}

export function QuoteItemsList({
  items,
  activeItemId,
  maquina,
  cliente,
  onSelect,
  onAdd,
  onRemove,
  onPatchItem,
  onApplyMarginToAll,
  onGoToComparar,
  onSave,
  podeSalvar,
  salvoRecentemente,
}: {
  items: QuoteItem[]
  activeItemId: string
  /** Só pro nome do arquivo ao gerar a planilha do fornecedor — ver handleGerarPlanilhaFornecedor. */
  maquina: string
  cliente: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onPatchItem: (id: string, patch: Partial<ProductInput>) => void
  onApplyMarginToAll: (lucroPct: number) => void
  onGoToComparar: () => void
  onSave: () => void
  /** false quando a cotação está travada por outro admin — desabilita o botão enquanto isso. */
  podeSalvar: boolean
  /** true por alguns segundos logo depois de salvar — mostra "Cotação salva!" ao lado do botão. */
  salvoRecentemente: boolean
}) {
  const [margemUnica, setMargemUnica] = useState('')
  const [modoFrete, setModoFrete] = useState<ModoFrete>('pct')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedorAbertoId, setFornecedorAbertoId] = useState<string | null>(null)
  const [ordemColunas, setOrdemColunas] = useState<ColunaKey[]>(carregarOrdemColunas)
  const [colunaArrastada, setColunaArrastada] = useState<ColunaKey | null>(null)
  // marcação por checkbox pra aplicar o mesmo fornecedor (ou NCM) em vários itens de uma vez —
  // independente do "item ativo" (activeItemId) de baixo, que é outra coisa (qual item tá aberto
  // no painel de edição)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [fornecedorBulk, setFornecedorBulk] = useState('')
  const [fornecedorBulkAberto, setFornecedorBulkAberto] = useState(false)
  const [ncmBulk, setNcmBulk] = useState('')
  const [planilhaFornecedorAberta, setPlanilhaFornecedorAberta] = useState(false)
  const [freteBulk, setFreteBulk] = useState('')

  useEffect(() => {
    listFornecedores()
      .then(setFornecedores)
      .catch(() => {
        // sugestão é só um extra — se o servidor estiver fora, o campo continua livre normalmente
      })
  }, [])

  useEffect(() => {
    function fecharAoClicarFora() {
      setFornecedorAbertoId(null)
    }
    document.addEventListener('mousedown', fecharAoClicarFora)
    return () => document.removeEventListener('mousedown', fecharAoClicarFora)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_ORDEM_COLUNAS, JSON.stringify(ordemColunas))
    } catch {
      // sem localStorage disponível — a ordem só não persiste entre sessões, sem quebrar a tela
    }
  }, [ordemColunas])

  const cellCls = 'px-1 py-1 border-t border-ink-100'
  const inputCls =
    'w-full bg-transparent border-0 rounded px-1.5 py-1.5 text-ink-800 focus:outline-none focus:ring-1 focus:ring-brand-400'

  function stop(e: MouseEvent) {
    e.stopPropagation()
  }

  // só os ids marcados que ainda existem (um item marcado pode ter sido removido nesse meio-tempo)
  const idsMarcados = useMemo(() => items.map((i) => i.id).filter((id) => marcados.has(id)), [items, marcados])

  function toggleMarcado(id: string) {
    setMarcados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMarcarTodos() {
    setMarcados(idsMarcados.length === items.length ? new Set() : new Set(items.map((i) => i.id)))
  }

  const sugestoesFornecedorBulk = useMemo(() => {
    const termo = fornecedorBulk.trim().toLowerCase()
    const lista = termo ? fornecedores.filter((f) => f.nome.toLowerCase().includes(termo)) : fornecedores
    return lista.slice(0, 6)
  }, [fornecedores, fornecedorBulk])

  function aplicarFornecedorAosMarcados(nome: string, estado?: string) {
    const nomeLimpo = nome.trim()
    if (!nomeLimpo || idsMarcados.length === 0) return
    for (const id of idsMarcados) {
      onPatchItem(id, { fornecedor: nomeLimpo, ...(estado ? { estadoOrigem: estado } : {}) })
    }
    setMarcados(new Set())
    setFornecedorBulk('')
    setFornecedorBulkAberto(false)
  }

  function handleAplicarFornecedorBulkDigitado() {
    const encontrado = fornecedores.find((f) => f.nome.toLowerCase() === fornecedorBulk.trim().toLowerCase())
    aplicarFornecedorAosMarcados(fornecedorBulk, encontrado?.estado)
  }

  function handleAplicarNcmAosMarcados() {
    const ncmLimpo = ncmBulk.trim()
    if (!ncmLimpo || idsMarcados.length === 0) return
    for (const id of idsMarcados) onPatchItem(id, { ncm: ncmLimpo })
    setMarcados(new Set())
    setNcmBulk('')
  }

  // respeita o mesmo alternador %/R$ do cabeçalho da coluna Frete: em % é uma taxa única pra todo
  // mundo; em R$ cada item marcado recebe uma taxa diferente, calculada pra bater nesse valor fixo
  // em reais sobre o próprio valor do item — igual ao que já acontece editando célula por célula
  function handleAplicarFreteAosMarcados() {
    const valor = Number(freteBulk.replace(',', '.'))
    if (!freteBulk.trim() || Number.isNaN(valor) || idsMarcados.length === 0) return
    for (const item of items) {
      if (!marcados.has(item.id)) continue
      if (modoFrete === 'pct') {
        onPatchItem(item.id, { freteRate: valor / 100 })
      } else {
        const vlrProdutoItem = (item.product.qtd || 0) * (item.product.valorUnt || 0)
        onPatchItem(item.id, { freteRate: vlrProdutoItem > 0 ? valor / vlrProdutoItem : 0 })
      }
    }
    setMarcados(new Set())
    setFreteBulk('')
  }

  // abre a pré-visualização da planilha de pedido de cotação (formato ORÇAMENTO) só com os itens
  // marcados — pra mandar pro fornecedor pedir preço, não com a cotação inteira
  const itensParaPlanilhaFornecedor = useMemo(() => items.filter((item) => marcados.has(item.id)), [items, marcados])
  function handleGerarPlanilhaFornecedor() {
    if (itensParaPlanilhaFornecedor.length === 0) return
    setPlanilhaFornecedorAberta(true)
  }

  function handleAplicarMargemUnica() {
    const valor = Number(margemUnica.replace(',', '.'))
    if (!margemUnica.trim() || Number.isNaN(valor)) {
      void avisar('Informe uma margem válida, em %.')
      return
    }
    onApplyMarginToAll(valor / 100)
  }

  function moverColuna(origem: ColunaKey, destino: ColunaKey) {
    if (origem === destino) return
    setOrdemColunas((prev) => {
      const indiceOrigem = prev.indexOf(origem)
      const indiceDestino = prev.indexOf(destino)
      if (indiceOrigem === -1 || indiceDestino === -1) return prev
      const proxima = [...prev]
      proxima.splice(indiceOrigem, 1)
      // tira a coluna de origem primeiro desloca tudo que vinha depois dela um índice pra trás —
      // se o destino tava depois da origem, o índice dele nessa cópia já encolheu junto
      const indiceInsercao = indiceOrigem < indiceDestino ? indiceDestino - 1 : indiceDestino
      proxima.splice(indiceInsercao, 0, origem)
      return proxima
    })
  }

  function renderCabecalho(chave: ColunaKey) {
    const conteudo =
      chave === 'frete' ? (
        <div className="flex items-center justify-end gap-1">
          <span>Frete</span>
          <span className="inline-flex rounded-md border border-ink-200 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setModoFrete('pct')}
              className={`px-1.5 py-0.5 text-[10px] font-medium transition ${
                modoFrete === 'pct' ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
              }`}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => setModoFrete('valor')}
              className={`px-1.5 py-0.5 text-[10px] font-medium border-l border-ink-200 transition ${
                modoFrete === 'valor' ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
              }`}
            >
              R$
            </button>
          </span>
        </div>
      ) : (
        LABEL_COLUNA[chave]
      )

    return (
      <th
        key={chave}
        draggable
        onDragStart={() => setColunaArrastada(chave)}
        onDragOver={(e: DragEvent) => e.preventDefault()}
        onDrop={(e: DragEvent) => {
          e.preventDefault()
          if (colunaArrastada) moverColuna(colunaArrastada, chave)
          setColunaArrastada(null)
        }}
        onDragEnd={() => setColunaArrastada(null)}
        title="Arraste pra reordenar as colunas"
        className={`py-2 px-2 font-medium cursor-move select-none transition ${CLASSE_COLUNA[chave]} ${
          colunaArrastada === chave ? 'opacity-40' : ''
        }`}
      >
        {conteudo}
      </th>
    )
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Itens da cotação</h2>
          <p className="text-sm text-ink-400">
            Edite direto na planilha — arraste o cabeçalho pra reordenar as colunas do seu jeito.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {salvoRecentemente && (
            <span className="text-xs font-medium text-emerald-600">✓ Cotação salva!</span>
          )}
          <button
            type="button"
            onClick={onGoToComparar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 transition"
          >
            Comparar fornecedores
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
          >
            + Adicionar item
          </button>
          <Button variant="primary" onClick={onSave} disabled={!podeSalvar}>
            Salvar cotação
          </Button>
        </div>
      </div>

      {items.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
          <span className="text-xs text-ink-500">Margem única pra todos os itens:</span>
          <input
            type="number"
            step={0.1}
            placeholder="%"
            value={margemUnica}
            onChange={(e) => setMargemUnica(e.target.value)}
            className="field-input w-20 py-1 text-sm"
          />
          <button
            type="button"
            onClick={handleAplicarMargemUnica}
            className="pill-tab border border-ink-200 text-ink-600 hover:bg-white"
          >
            Aplicar a todos
          </button>
        </div>
      )}

      {idsMarcados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
          <span className="text-xs font-medium text-brand-700">
            {idsMarcados.length} item{idsMarcados.length > 1 ? 's' : ''} marcado{idsMarcados.length > 1 ? 's' : ''}:
          </span>
          <div className="relative">
            <input
              type="text"
              placeholder="Nome do fornecedor"
              value={fornecedorBulk}
              onChange={(e) => {
                setFornecedorBulk(e.target.value)
                setFornecedorBulkAberto(true)
              }}
              onFocus={() => setFornecedorBulkAberto(true)}
              className="field-input w-48 py-1 text-sm"
            />
            {fornecedorBulkAberto && sugestoesFornecedorBulk.length > 0 && (
              <div
                className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-ink-200 bg-surface shadow-lg max-h-56 overflow-auto"
                onMouseDown={(e) => e.preventDefault()}
              >
                {sugestoesFornecedorBulk.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => aplicarFornecedorAosMarcados(f.nome, f.estado)}
                    className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-ink-50 focus:bg-ink-50 focus:outline-none"
                  >
                    {f.nome}
                    {f.cidade ? <span className="text-ink-400"> — {f.cidade}{f.estado ? ` / ${f.estado}` : ''}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleAplicarFornecedorBulkDigitado}
            className="pill-tab border border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
          >
            Aplicar fornecedor
          </button>
          <span className="w-px self-stretch bg-brand-200" />
          <input
            type="text"
            placeholder="NCM"
            value={ncmBulk}
            onChange={(e) => setNcmBulk(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAplicarNcmAosMarcados()}
            className="field-input w-32 py-1 text-sm font-mono"
          />
          <button
            type="button"
            onClick={handleAplicarNcmAosMarcados}
            className="pill-tab border border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
          >
            Aplicar NCM
          </button>
          <span className="w-px self-stretch bg-brand-200" />
          <input
            type="number"
            step={0.01}
            placeholder={modoFrete === 'pct' ? 'Frete %' : 'Frete R$'}
            value={freteBulk}
            onChange={(e) => setFreteBulk(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAplicarFreteAosMarcados()}
            className="field-input w-24 py-1 text-sm text-right tabular-nums"
          />
          <button
            type="button"
            onClick={handleAplicarFreteAosMarcados}
            className="pill-tab border border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
          >
            Aplicar frete
          </button>
          <span className="w-px self-stretch bg-brand-200" />
          <button
            type="button"
            onClick={() => setMarcados(new Set())}
            className="pill-tab border border-ink-200 text-ink-500 hover:bg-white"
          >
            Limpar marcação
          </button>
          <button
            type="button"
            onClick={handleGerarPlanilhaFornecedor}
            title="Mostra uma prévia da planilha (.xlsx) só com os itens marcados, no formato de orçamento pra pedir preço ao fornecedor"
            className="pill-tab border border-ink-200 text-ink-600 hover:bg-white"
          >
            Gerar planilha do fornecedor (.xlsx)
          </button>
        </div>
      )}

      {planilhaFornecedorAberta && (
        <PlanilhaFornecedorModal
          items={itensParaPlanilhaFornecedor}
          maquina={maquina}
          cliente={cliente}
          onClose={() => setPlanilhaFornecedorAberta(false)}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-ink-50 text-left text-ink-400">
              <th className="py-2 px-2 w-8">
                <input
                  type="checkbox"
                  checked={items.length > 0 && idsMarcados.length === items.length}
                  onChange={toggleMarcarTodos}
                  title="Marcar/desmarcar todos"
                />
              </th>
              <th className="py-2 px-2 font-medium w-8">#</th>
              {ordemColunas.map((chave) => renderCabecalho(chave))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const isActive = item.id === activeItemId
              const totalItens = (item.product.qtd || 0) * (item.product.valorUnt || 0)
              return (
                <LinhaItem
                  key={item.id}
                  item={item}
                  index={index}
                  isActive={isActive}
                  totalItens={totalItens}
                  modoFrete={modoFrete}
                  fornecedores={fornecedores}
                  fornecedorAberto={fornecedorAbertoId === item.id}
                  onAbrirFornecedor={() => setFornecedorAbertoId(item.id)}
                  onFecharFornecedor={() => setFornecedorAbertoId((atual) => (atual === item.id ? null : atual))}
                  marcado={marcados.has(item.id)}
                  onToggleMarcado={() => toggleMarcado(item.id)}
                  onSelect={() => onSelect(item.id)}
                  onRemove={() => onRemove(item.id)}
                  onPatch={(patch) => onPatchItem(item.id, patch)}
                  podeRemover={items.length > 1}
                  cellCls={cellCls}
                  inputCls={inputCls}
                  stop={stop}
                  ordemColunas={ordemColunas}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LinhaItem({
  item,
  index,
  isActive,
  totalItens,
  modoFrete,
  fornecedores,
  fornecedorAberto,
  onAbrirFornecedor,
  onFecharFornecedor,
  marcado,
  onToggleMarcado,
  onSelect,
  onRemove,
  onPatch,
  podeRemover,
  cellCls,
  inputCls,
  stop,
  ordemColunas,
}: {
  item: QuoteItem
  index: number
  isActive: boolean
  totalItens: number
  modoFrete: ModoFrete
  fornecedores: Fornecedor[]
  fornecedorAberto: boolean
  onAbrirFornecedor: () => void
  onFecharFornecedor: () => void
  marcado: boolean
  onToggleMarcado: () => void
  onSelect: () => void
  onRemove: () => void
  onPatch: (patch: Partial<ProductInput>) => void
  podeRemover: boolean
  cellCls: string
  inputCls: string
  stop: (e: MouseEvent) => void
  ordemColunas: ColunaKey[]
}) {
  const vlrProduto = (item.product.qtd || 0) * (item.product.valorUnt || 0)
  const valorFreteAtual = vlrProduto * (item.product.freteRate || 0)
  const precoVendaUnitario = useMemo(
    () => calculateItem(item.product, item.pricing).precoVendaUnitario,
    [item.product, item.pricing],
  )

  const sugestoesFornecedor = useMemo(() => {
    const termo = item.product.fornecedor.trim().toLowerCase()
    const lista = termo ? fornecedores.filter((f) => f.nome.toLowerCase().includes(termo)) : fornecedores
    return lista.slice(0, 6)
  }, [fornecedores, item.product.fornecedor])

  function handleSelecionarFornecedor(f: Fornecedor) {
    onPatch({ fornecedor: f.nome, ...(f.estado ? { estadoOrigem: f.estado } : {}) })
    onFecharFornecedor()
  }

  // ao achar um produto já cadastrado com o mesmo Interno/Referência, carrega os demais dados
  // dele — menos qtd (quantidade é sempre desse pedido, não do histórico) e as cotações de
  // fornecedor registradas (pertencem à análise antiga, não fazem sentido aqui)
  function aplicarProdutoEncontrado(found: ProductInput) {
    onPatch({
      perfil: found.perfil,
      referencia: found.referencia,
      ncm: found.ncm,
      interno: found.interno,
      fornecedor: found.fornecedor,
      marca: found.marca,
      freteRate: found.freteRate,
      estadoOrigem: found.estadoOrigem,
      descricao: found.descricao,
      valorUnt: found.valorUnt,
      peso: found.peso,
      prazoEntrega: found.prazoEntrega,
      stRetido: found.stRetido,
      outrasDespesas: found.outrasDespesas,
      desconto: found.desconto,
      ipi: found.ipi,
      freteAdicional: found.freteAdicional,
      credIcmsFrete: found.credIcmsFrete,
    })
  }

  async function handleInternoBlur() {
    const found = await findByInterno(item.product.interno)
    if (found) aplicarProdutoEncontrado(found)
  }

  async function handleReferenciaBlur() {
    const found = await findByReferencia(item.product.referencia)
    if (found) aplicarProdutoEncontrado(found)
  }

  const celulas: Record<ColunaKey, JSX.Element> = {
    interno: (
      <td key="interno" className={cellCls}>
        <input
          className={`${inputCls} font-mono`}
          value={item.product.interno}
          onChange={(e) => onPatch({ interno: e.target.value })}
          onBlur={handleInternoBlur}
          onClick={stop}
        />
      </td>
    ),
    referencia: (
      <td key="referencia" className={cellCls}>
        <input
          className={inputCls}
          value={item.product.referencia}
          onChange={(e) => onPatch({ referencia: e.target.value })}
          onBlur={handleReferenciaBlur}
          onClick={stop}
        />
      </td>
    ),
    descricao: (
      <td key="descricao" className={cellCls}>
        <input
          className={inputCls}
          value={item.product.descricao}
          onChange={(e) => onPatch({ descricao: e.target.value })}
          onClick={stop}
        />
      </td>
    ),
    ncm: (
      <td key="ncm" className={cellCls}>
        <input
          className={`${inputCls} font-mono`}
          placeholder="0000.00.00"
          value={item.product.ncm}
          onChange={(e) => onPatch({ ncm: e.target.value })}
          onClick={stop}
        />
      </td>
    ),
    fornecedor: (
      <td key="fornecedor" className={`${cellCls} relative`}>
        <input
          className={inputCls}
          value={item.product.fornecedor}
          onChange={(e) => {
            onPatch({ fornecedor: e.target.value })
            onAbrirFornecedor()
          }}
          onFocus={onAbrirFornecedor}
          onClick={(e) => {
            stop(e)
            onAbrirFornecedor()
          }}
        />
        {fornecedorAberto && sugestoesFornecedor.length > 0 && (
          <div
            className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-ink-200 bg-surface shadow-lg max-h-56 overflow-auto"
            onClick={stop}
            onMouseDown={stop}
          >
            {sugestoesFornecedor.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleSelecionarFornecedor(f)}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-ink-50 focus:bg-ink-50 focus:outline-none"
              >
                {f.nome}
                {f.cidade ? <span className="text-ink-400"> — {f.cidade}{f.estado ? ` / ${f.estado}` : ''}</span> : null}
              </button>
            ))}
          </div>
        )}
      </td>
    ),
    uf: (
      <td key="uf" className={cellCls}>
        <select
          className={inputCls}
          value={item.product.estadoOrigem}
          onChange={(e) => onPatch({ estadoOrigem: e.target.value })}
          onClick={stop}
        >
          {ESTADOS.map((e) => (
            <option key={e.uf} value={e.uf}>
              {e.uf}
            </option>
          ))}
        </select>
      </td>
    ),
    qtd: (
      <td key="qtd" className={cellCls}>
        <input
          type="number"
          min={0}
          className={`${inputCls} text-right tabular-nums`}
          value={item.product.qtd}
          onChange={(e) => onPatch({ qtd: Number(e.target.value) || 0 })}
          onClick={stop}
          onFocus={selecionarTudoAoFocar}
        />
      </td>
    ),
    peso: (
      <td key="peso" className={cellCls}>
        <input
          type="number"
          min={0}
          step={0.01}
          className={`${inputCls} text-right tabular-nums`}
          value={item.product.peso}
          onChange={(e) => onPatch({ peso: Number(e.target.value) || 0 })}
          onClick={stop}
          onFocus={selecionarTudoAoFocar}
        />
      </td>
    ),
    valorUnt: (
      <td key="valorUnt" className={cellCls}>
        <input
          type="number"
          min={0}
          step={0.01}
          className={`${inputCls} text-right tabular-nums`}
          value={item.product.valorUnt}
          onChange={(e) => onPatch({ valorUnt: Number(e.target.value) || 0 })}
          onClick={stop}
          onFocus={selecionarTudoAoFocar}
        />
      </td>
    ),
    precoVenda: (
      <td key="precoVenda" className={`${cellCls} text-right font-mono tabular-nums text-ink-800`}>
        {formatCurrency(precoVendaUnitario)}
      </td>
    ),
    frete: (
      <td key="frete" className={cellCls}>
        {modoFrete === 'pct' ? (
          <input
            type="number"
            min={0}
            step={0.1}
            className={`${inputCls} text-right tabular-nums`}
            value={Math.round((item.product.freteRate || 0) * 10000) / 100}
            onChange={(e) => onPatch({ freteRate: (Number(e.target.value) || 0) / 100 })}
            onClick={stop}
            onFocus={selecionarTudoAoFocar}
          />
        ) : (
          <input
            type="number"
            min={0}
            step={0.01}
            className={`${inputCls} text-right tabular-nums`}
            value={Math.round(valorFreteAtual * 100) / 100}
            onChange={(e) => {
              const novoValor = Number(e.target.value) || 0
              onPatch({ freteRate: vlrProduto > 0 ? novoValor / vlrProduto : 0 })
            }}
            onClick={stop}
            onFocus={selecionarTudoAoFocar}
          />
        )}
      </td>
    ),
    prazo: (
      <td key="prazo" className={cellCls}>
        <input
          className={inputCls}
          placeholder="ex.: 2 DIAS"
          value={item.product.prazoEntrega}
          onChange={(e) => onPatch({ prazoEntrega: e.target.value })}
          onClick={stop}
        />
      </td>
    ),
    total: (
      <td key="total" className={`${cellCls} text-right font-mono tabular-nums text-ink-800 pr-3`}>
        {formatCurrency(totalItens)}
      </td>
    ),
  }

  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer transition ${isActive ? 'bg-brand-50' : marcado ? 'bg-brand-50/40' : 'hover:bg-ink-50'}`}
    >
      <td className={`${cellCls} text-center`} onClick={stop}>
        <input type="checkbox" checked={marcado} onChange={onToggleMarcado} />
      </td>
      <td className={`${cellCls} text-ink-400 text-xs text-center`}>{index + 1}</td>
      {ordemColunas.map((chave) => celulas[chave])}
      <td className={`${cellCls} text-center`}>
        {podeRemover && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label="Remover item"
            className="h-6 w-6 rounded-full text-xs leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  )
}
