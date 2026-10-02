import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { formatCurrency, formatDate, selecionarTudoAoFocar } from '../utils'
import { calculateItem } from '../calc/calculator'
import { ESTADOS } from '../data/estados'
import { listFornecedores } from '../db/fornecedoresRepo'
import { buscarUltimoUsoDoProduto, type UltimoUsoDoProduto } from '../db/analysesRepo'
import { findProdutoPorInternoOuReferencia } from '../db/produtosRepo'
import { PlanilhaFornecedorModal } from './PlanilhaFornecedorModal'
import { Button } from './ui/Basics'
import { avisar } from '../dialogs'
import type { Fornecedor, ProductInput, ProdutoCotacaoHistorico, QuoteItem } from '../types'

type ModoFrete = 'pct' | 'valor'

type ColunaKey =
  | 'interno'
  | 'referencia'
  | 'descricao'
  | 'ncm'
  | 'fornecedor'
  | 'marca'
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
  'marca',
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
  marca: 'Marca',
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
  marca: 'min-w-[8rem]',
  uf: 'min-w-[4.5rem]',
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
    const salvo: unknown = JSON.parse(bruto)
    if (!Array.isArray(salvo)) return COLUNAS_PADRAO
    // aproveita a ordem que a pessoa já tinha montado: descarta coluna que não existe mais e encaixa
    // coluna nova (ex.: Marca) logo depois da que vem antes dela na ordem padrão — sem isso, toda
    // coluna adicionada numa atualização jogava fora a ordem personalizada inteira
    const ordem = Array.from(new Set(salvo.filter((c): c is ColunaKey => COLUNAS_PADRAO.includes(c as ColunaKey))))
    COLUNAS_PADRAO.forEach((coluna, i) => {
      if (ordem.includes(coluna)) return
      const anterior = COLUNAS_PADRAO.slice(0, i).reverse().find((c) => ordem.includes(c))
      ordem.splice(anterior ? ordem.indexOf(anterior) + 1 : 0, 0, coluna)
    })
    return ordem
  } catch {
    return COLUNAS_PADRAO
  }
}

/** Histórico de preço achado ao digitar Interno/Referência — mostrado logo abaixo da linha. */
interface HistoricoPreco {
  ultimoUso?: UltimoUsoDoProduto
  maisBarato?: ProdutoCotacaoHistorico
}

// valores especiais dos filtros (não colidem com nenhum valor real de célula)
const FILTRO_TODOS = '__todos__'
const FILTRO_VAZIO = '__vazio__'

/** O texto de uma célula como aparece na tela — usado pros filtros: cada coluna lista os valores
 * distintos que aparecem nela, e escolher um mostra só os itens com aquele valor. */
function textoDaColuna(item: QuoteItem, chave: ColunaKey, modoFrete: ModoFrete): string {
  const p = item.product
  const vlrProduto = (p.qtd || 0) * (p.valorUnt || 0)
  switch (chave) {
    case 'interno':
      return p.interno.trim()
    case 'referencia':
      return p.referencia.trim()
    case 'descricao':
      return p.descricao.trim()
    case 'ncm':
      return p.ncm.trim()
    case 'fornecedor':
      return p.fornecedor.trim()
    case 'marca':
      return p.marca.trim()
    case 'uf':
      return p.estadoOrigem
    case 'qtd':
      return String(p.qtd || 0)
    case 'peso':
      return String(p.peso || 0)
    case 'valorUnt':
      return formatCurrency(p.valorUnt || 0)
    case 'precoVenda':
      return formatCurrency(calculateItem(p, item.pricing).precoVendaUnitario)
    case 'frete':
      return modoFrete === 'pct'
        ? `${Math.round((p.freteRate || 0) * 10000) / 100}%`
        : formatCurrency(vlrProduto * (p.freteRate || 0))
    case 'prazo':
      return p.prazoEntrega.trim()
    case 'total':
      return formatCurrency(vlrProduto)
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
  const [marcaBulk, setMarcaBulk] = useState('')
  const [ncmBulk, setNcmBulk] = useState('')
  const [planilhaFornecedorAberta, setPlanilhaFornecedorAberta] = useState(false)
  const [freteBulk, setFreteBulk] = useState('')
  // filtro por coluna — valor exato (o texto da célula) que tem que bater; coluna ausente = todos
  const [filtros, setFiltros] = useState<Partial<Record<ColunaKey, string>>>({})
  // fica aqui (e não dentro de cada linha) porque carregar o histórico costuma trocar o fornecedor
  // do item — e aí ele muda de grupo, a linha é remontada em outro lugar e perderia o aviso
  const [historicos, setHistoricos] = useState<Record<string, HistoricoPreco>>({})

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

  // --- filtros ---------------------------------------------------------------
  const filtrosAtivos = Object.keys(filtros).length > 0

  const valoresPorColuna = useMemo(() => {
    const resultado = {} as Record<ColunaKey, string[]>
    for (const chave of COLUNAS_PADRAO) {
      const distintos = new Set(items.map((item) => textoDaColuna(item, chave, modoFrete)))
      resultado[chave] = Array.from(distintos).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    }
    return resultado
  }, [items, modoFrete])

  const itensFiltrados = useMemo(
    () =>
      items.filter((item) =>
        (Object.entries(filtros) as [ColunaKey, string][]).every(([chave, valor]) => textoDaColuna(item, chave, modoFrete) === valor),
      ),
    [items, filtros, modoFrete],
  )

  function setFiltro(chave: ColunaKey, valorSelect: string) {
    setFiltros((prev) => {
      const next = { ...prev }
      if (valorSelect === FILTRO_TODOS) delete next[chave]
      else next[chave] = valorSelect === FILTRO_VAZIO ? '' : valorSelect
      return next
    })
  }

  // --- agrupamento por fornecedor ---------------------------------------------
  // itens de fornecedores diferentes ficam em blocos separados, cada um com cabeçalho próprio
  // (nome, quantidade de itens, subtotal) — só quando há mais de um fornecedor na tela; com um só,
  // a tabela fica corrida, sem um cabeçalho de grupo que não separaria nada
  const grupos = useMemo(() => {
    const mapa = new Map<string, { fornecedor: string; itens: QuoteItem[] }>()
    for (const item of itensFiltrados) {
      const nome = item.product.fornecedor.trim()
      const chave = nome.toUpperCase()
      if (!mapa.has(chave)) mapa.set(chave, { fornecedor: nome, itens: [] })
      mapa.get(chave)!.itens.push(item)
    }
    return Array.from(mapa.values())
  }, [itensFiltrados])
  const agrupar = grupos.length > 1

  // número da linha = posição do item na cotação inteira, não na tela — continua o mesmo com filtro
  // ou agrupamento, pra "item 7" ser sempre o mesmo item
  const numeroDoItem = useMemo(() => new Map(items.map((item, i) => [item.id, i + 1])), [items])

  // --- marcação ----------------------------------------------------------------
  // só os ids marcados que ainda existem (um item marcado pode ter sido removido nesse meio-tempo)
  const idsMarcados = useMemo(() => items.map((i) => i.id).filter((id) => marcados.has(id)), [items, marcados])
  const idsVisiveis = useMemo(() => itensFiltrados.map((i) => i.id), [itensFiltrados])
  const todosVisiveisMarcados = idsVisiveis.length > 0 && idsVisiveis.every((id) => marcados.has(id))

  function toggleMarcado(id: string) {
    setMarcados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Marca/desmarca um conjunto de itens de uma vez (todos os visíveis, ou um grupo de fornecedor). */
  function toggleConjunto(ids: string[]) {
    setMarcados((prev) => {
      const next = new Set(prev)
      const todosMarcados = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (todosMarcados) next.delete(id)
        else next.add(id)
      }
      return next
    })
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

  function handleAplicarMarcaAosMarcados() {
    const marcaLimpa = marcaBulk.trim()
    if (!marcaLimpa || idsMarcados.length === 0) return
    for (const id of idsMarcados) onPatchItem(id, { marca: marcaLimpa })
    setMarcados(new Set())
    setMarcaBulk('')
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

  function renderFiltro(chave: ColunaKey) {
    const ativo = chave in filtros
    const valorAtual = filtros[chave]
    const valorSelect = !ativo ? FILTRO_TODOS : valorAtual === '' ? FILTRO_VAZIO : (valorAtual as string)
    return (
      <th key={chave} className="px-1 pb-1.5 font-normal">
        <select
          value={valorSelect}
          onChange={(e) => setFiltro(chave, e.target.value)}
          title={`Filtrar por ${LABEL_COLUNA[chave]}`}
          className={`w-full min-w-[4.5rem] rounded-md border px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-brand-400 ${
            ativo ? 'border-brand-400 bg-brand-50 text-ink-900 font-semibold' : 'border-ink-200 bg-surface text-ink-500'
          }`}
        >
          <option value={FILTRO_TODOS}>Todos</option>
          {valoresPorColuna[chave].map((v) => (
            <option key={v || FILTRO_VAZIO} value={v || FILTRO_VAZIO}>
              {v || '(vazio)'}
            </option>
          ))}
        </select>
      </th>
    )
  }

  const totalColunas = ordemColunas.length + 3

  function renderLinha(item: QuoteItem) {
    const totalItens = (item.product.qtd || 0) * (item.product.valorUnt || 0)
    return (
      <LinhaItem
        key={item.id}
        item={item}
        numero={numeroDoItem.get(item.id) ?? 0}
        isActive={item.id === activeItemId}
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
        totalColunas={totalColunas}
        historico={historicos[item.id]}
        onHistorico={(h) =>
          setHistoricos((prev) => {
            const next = { ...prev }
            if (h) next[item.id] = h
            else delete next[item.id]
            return next
          })
        }
      />
    )
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Itens da cotação</h2>
          <p className="text-sm text-ink-400">
            Edite direto na planilha — arraste o cabeçalho pra reordenar as colunas, e use a linha de filtros logo
            abaixo dele pra ver só o que interessa.
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
            placeholder="Marca"
            value={marcaBulk}
            onChange={(e) => setMarcaBulk(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAplicarMarcaAosMarcados()}
            className="field-input w-32 py-1 text-sm"
          />
          <button
            type="button"
            onClick={handleAplicarMarcaAosMarcados}
            className="pill-tab border border-brand-600 bg-brand-600 text-white hover:bg-brand-700"
          >
            Aplicar marca
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

      {filtrosAtivos && (
        <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
          <span className="text-ink-500">
            Mostrando <strong className="text-ink-900">{itensFiltrados.length}</strong> de {items.length} itens (filtrado
            por {(Object.keys(filtros) as ColunaKey[]).map((c) => LABEL_COLUNA[c]).join(', ')})
          </span>
          <button
            type="button"
            onClick={() => setFiltros({})}
            className="pill-tab border border-ink-200 py-1 text-ink-600 hover:bg-ink-50"
          >
            Limpar filtros
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-ink-50 text-left text-ink-400">
              <th className="py-2 px-2 w-8">
                <input
                  type="checkbox"
                  checked={todosVisiveisMarcados}
                  onChange={() => toggleConjunto(idsVisiveis)}
                  title="Marcar/desmarcar todos os itens visíveis"
                />
              </th>
              <th className="py-2 px-2 font-medium w-8">#</th>
              {ordemColunas.map((chave) => renderCabecalho(chave))}
              <th className="w-8"></th>
            </tr>
            <tr className="bg-ink-50 text-left">
              <th />
              <th />
              {ordemColunas.map((chave) => renderFiltro(chave))}
              <th />
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.length === 0 && (
              <tr>
                <td colSpan={totalColunas} className="py-6 text-center text-sm text-ink-400 border-t border-ink-100">
                  Nenhum item com esses filtros.
                </td>
              </tr>
            )}
            {agrupar
              ? grupos.map((grupo) => {
                  const idsGrupo = grupo.itens.map((i) => i.id)
                  const grupoMarcado = idsGrupo.every((id) => marcados.has(id))
                  const subtotal = grupo.itens.reduce(
                    (s, i) => s + (i.product.qtd || 0) * (i.product.valorUnt || 0),
                    0,
                  )
                  return (
                    <Fragment key={grupo.fornecedor.toUpperCase() || '__sem_fornecedor__'}>
                      <tr className="bg-ink-100/70">
                        <td className="px-2 py-2 border-t-2 border-ink-200 text-center">
                          <input
                            type="checkbox"
                            checked={grupoMarcado}
                            onChange={() => toggleConjunto(idsGrupo)}
                            title="Marcar/desmarcar todos os itens desse fornecedor"
                          />
                        </td>
                        {/* tudo alinhado à esquerda de propósito: a tabela costuma ser mais larga que
                         * a tela (rola de lado), e o que ficasse na ponta direita sumia de vista */}
                        <td colSpan={totalColunas - 1} className="px-2 py-2 border-t-2 border-ink-200">
                          <span className="font-display font-semibold text-ink-900">
                            {grupo.fornecedor || 'Sem fornecedor definido'}
                          </span>
                          <span className="ml-2 text-xs text-ink-500">
                            {grupo.itens.length} item{grupo.itens.length > 1 ? 's' : ''} · Subtotal{' '}
                            <span className="font-mono font-semibold tabular-nums text-ink-900">{formatCurrency(subtotal)}</span>
                          </span>
                        </td>
                      </tr>
                      {grupo.itens.map(renderLinha)}
                    </Fragment>
                  )
                })
              : itensFiltrados.map(renderLinha)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LinhaItem({
  item,
  numero,
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
  totalColunas,
  historico,
  onHistorico,
}: {
  item: QuoteItem
  numero: number
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
  totalColunas: number
  historico: HistoricoPreco | undefined
  onHistorico: (h: HistoricoPreco | null) => void
}) {
  const vlrProduto = (item.product.qtd || 0) * (item.product.valorUnt || 0)
  const valorFreteAtual = vlrProduto * (item.product.freteRate || 0)
  const precoVendaUnitario = useMemo(
    () => calculateItem(item.product, item.pricing).precoVendaUnitario,
    [item.product, item.pricing],
  )
  // último código buscado — evita recarregar (e sobrescrever o que já foi editado na linha) só por
  // entrar e sair do campo sem ter mudado nada
  const ultimaBusca = useRef({ interno: item.product.interno.trim(), referencia: item.product.referencia.trim() })

  const sugestoesFornecedor = useMemo(() => {
    const termo = item.product.fornecedor.trim().toLowerCase()
    const lista = termo ? fornecedores.filter((f) => f.nome.toLowerCase().includes(termo)) : fornecedores
    return lista.slice(0, 6)
  }, [fornecedores, item.product.fornecedor])

  function handleSelecionarFornecedor(f: Fornecedor) {
    onPatch({ fornecedor: f.nome, ...(f.estado ? { estadoOrigem: f.estado } : {}) })
    onFecharFornecedor()
  }

  // ao achar um produto já usado em outra cotação com o mesmo Interno/Referência, carrega os demais
  // dados dele — menos qtd (quantidade é sempre desse pedido, não do histórico) e as cotações de
  // fornecedor registradas (pertencem à análise antiga, não fazem sentido aqui) — e mostra, logo
  // abaixo da linha, o último preço usado (com o fornecedor) e o mais barato já registrado no
  // catálogo de Produtos
  async function carregarHistorico(campo: 'interno' | 'referencia') {
    const valor = item.product[campo].trim()
    if (!valor || valor === ultimaBusca.current[campo]) return
    ultimaBusca.current = { ...ultimaBusca.current, [campo]: valor }

    const [ultimoUso, produto] = await Promise.all([
      buscarUltimoUsoDoProduto(campo, valor).catch(() => undefined),
      findProdutoPorInternoOuReferencia(
        campo === 'interno' ? valor : item.product.interno,
        campo === 'referencia' ? valor : item.product.referencia,
      ).catch(() => undefined),
    ])
    const maisBarato = produto?.melhoresCotacoes?.[0]
    if (!ultimoUso && !maisBarato) {
      onHistorico(null)
      return
    }
    if (ultimoUso) {
      const found = ultimoUso.product
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
      ultimaBusca.current = { interno: found.interno.trim(), referencia: found.referencia.trim() }
    }
    onHistorico({ ultimoUso, maisBarato })
  }

  function usarMaisBarato() {
    const mb = historico?.maisBarato
    if (!mb) return
    const f = fornecedores.find((x) => x.nome.trim().toLowerCase() === mb.fornecedor.trim().toLowerCase())
    onPatch({ fornecedor: mb.fornecedor, marca: mb.marca, valorUnt: mb.valorUnt, ...(f?.estado ? { estadoOrigem: f.estado } : {}) })
  }

  const celulas: Record<ColunaKey, JSX.Element> = {
    interno: (
      <td key="interno" className={cellCls}>
        <input
          className={`${inputCls} font-mono`}
          value={item.product.interno}
          onChange={(e) => onPatch({ interno: e.target.value })}
          onBlur={() => carregarHistorico('interno')}
          onKeyDown={(e) => e.key === 'Enter' && carregarHistorico('interno')}
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
          onBlur={() => carregarHistorico('referencia')}
          onKeyDown={(e) => e.key === 'Enter' && carregarHistorico('referencia')}
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
    marca: (
      <td key="marca" className={cellCls}>
        <input
          className={inputCls}
          value={item.product.marca}
          onChange={(e) => onPatch({ marca: e.target.value })}
          onClick={stop}
        />
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

  const maisBarato = historico?.maisBarato
  const ultimoUso = historico?.ultimoUso
  // o mais barato só vale destacar/oferecer quando é diferente do que já está na linha
  const maisBaratoJaAplicado =
    maisBarato !== undefined &&
    maisBarato.valorUnt === item.product.valorUnt &&
    maisBarato.fornecedor.trim().toLowerCase() === item.product.fornecedor.trim().toLowerCase()

  return (
    <>
      <tr
        onClick={onSelect}
        className={`cursor-pointer transition ${isActive ? 'bg-brand-50' : marcado ? 'bg-brand-50/40' : 'hover:bg-ink-50'}`}
      >
        <td className={`${cellCls} text-center`} onClick={stop}>
          <input type="checkbox" checked={marcado} onChange={onToggleMarcado} />
        </td>
        <td className={`${cellCls} text-ink-400 text-xs text-center`}>{numero}</td>
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
      {historico && (
        <tr className="bg-surface">
          <td colSpan={totalColunas} className="px-3 pb-2 pt-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-1.5 text-xs">
              {ultimoUso && ultimoUso.product.valorUnt > 0 && (
                <span className="text-ink-600">
                  Último preço usado:{' '}
                  <strong className="font-mono tabular-nums text-ink-900">{formatCurrency(ultimoUso.product.valorUnt)}</strong>
                  {' — '}
                  <strong className="text-ink-900">{ultimoUso.product.fornecedor || 'fornecedor não informado'}</strong>
                  {ultimoUso.product.marca ? ` · ${ultimoUso.product.marca}` : ''}
                  <span className="text-ink-400">
                    {' '}
                    (cotação {ultimoUso.codigo || 'sem código'}, {formatDate(ultimoUso.data)})
                  </span>
                </span>
              )}
              {maisBarato && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                  <span className="font-semibold uppercase tracking-wide text-[10px]">Mais barato já cotado</span>
                  <strong className="font-mono tabular-nums text-ink-900">{formatCurrency(maisBarato.valorUnt)}</strong>
                  — <strong className="text-ink-900">{maisBarato.fornecedor || 'fornecedor não informado'}</strong>
                  {maisBarato.marca ? ` · ${maisBarato.marca}` : ''}
                  {!maisBaratoJaAplicado && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        usarMaisBarato()
                      }}
                      className="ml-1 rounded border border-emerald-300 bg-white px-1.5 py-0.5 font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      Usar este
                    </button>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onHistorico(null)
                }}
                aria-label="Fechar"
                className="ml-auto text-ink-400 hover:text-ink-700"
              >
                ×
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
