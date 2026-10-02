import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { formatCurrency, formatDate, selecionarTudoAoFocar } from '../utils'
import { calculateItem } from '../calc/calculator'
import { ESTADOS } from '../data/estados'
import { listFornecedores } from '../db/fornecedoresRepo'
import {
  buscarQuote,
  buscarUltimoUsoDoProduto,
  chaveFornecedorFrete,
  freteDoFornecedor,
  limparCotacaoFreteTransportadora,
  rotuloRemetente,
  salvarFreteTransportadora,
  type RemetenteFrete,
  type UltimoUsoDoProduto,
} from '../db/analysesRepo'
import { findProdutoPorInternoOuReferencia } from '../db/produtosRepo'
import { PlanilhaFornecedorModal } from './PlanilhaFornecedorModal'
import { FreteFornecedorSlots } from './FreteFornecedorSlots'
import { Button } from './ui/Basics'
import { avisar, confirmar } from '../dialogs'
import type {
  Fornecedor,
  ItemExcluidoCotacao,
  ProductInput,
  ProdutoCotacaoHistorico,
  QuoteItem,
  QuoteRecord,
} from '../types'

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

const ALINHADA_DIREITA = new Set<ColunaKey>(['qtd', 'peso', 'valorUnt', 'precoVenda', 'frete', 'total'])

/** Largura padrão de cada coluna (px). Na tela, as colunas que ninguém ajustou à mão se adaptam à
 * largura da planilha (ver calcularLarguras); arrastar a borda do título fixa a largura daquela
 * coluna (duplo clique na borda volta ela pro ajuste automático). */
const LARGURA_PADRAO: Record<ColunaKey, number> = {
  interno: 112,
  referencia: 128,
  descricao: 220,
  ncm: 104,
  fornecedor: 160,
  marca: 120,
  uf: 84,
  qtd: 76,
  peso: 84,
  valorUnt: 104,
  precoVenda: 116,
  frete: 132,
  prazo: 112,
  total: 120,
}
const LARGURA_MINIMA = 48
const LARGURA_CHECKBOX = 34
const LARGURA_NUMERO = 34
/** Até quanto da largura padrão cada coluna pode encolher pra planilha caber na tela: as de texto
 * (descrição, fornecedor, marca…) encolhem bem; códigos e valores quase nada — cortados, deixariam
 * de servir pra conferir. Passando disso, a planilha rola de lado. */
const MINIMO_RELATIVO: Record<ColunaKey, number> = {
  interno: 0.85,
  referencia: 0.85,
  descricao: 0.55,
  ncm: 1,
  fornecedor: 0.75,
  marca: 0.7,
  uf: 0.8,
  qtd: 0.9,
  peso: 0.9,
  valorUnt: 0.9,
  precoVenda: 0.95,
  frete: 1,
  prazo: 0.7,
  total: 0.95,
}

// preferências só de exibição (não são dados da cotação) — guardadas no navegador de quem está
// usando, pra continuar do jeito que a pessoa deixou da última vez
const CHAVE_ORDEM_COLUNAS = 'itensCotacao:ordemColunas'
const CHAVE_LARGURAS_COLUNAS = 'itensCotacao:largurasColunas'
const CHAVE_COLUNAS_OCULTAS = 'itensCotacao:colunasOcultas'

function carregarLarguras(): Partial<Record<ColunaKey, number>> {
  try {
    const salvo: unknown = JSON.parse(localStorage.getItem(CHAVE_LARGURAS_COLUNAS) ?? '{}')
    if (!salvo || typeof salvo !== 'object') return {}
    const resultado: Partial<Record<ColunaKey, number>> = {}
    for (const [chave, valor] of Object.entries(salvo as Record<string, unknown>)) {
      if (COLUNAS_PADRAO.includes(chave as ColunaKey) && typeof valor === 'number' && valor >= LARGURA_MINIMA) {
        resultado[chave as ColunaKey] = Math.round(valor)
      }
    }
    return resultado
  } catch {
    return {}
  }
}

function carregarOcultas(): ColunaKey[] {
  try {
    const salvo: unknown = JSON.parse(localStorage.getItem(CHAVE_COLUNAS_OCULTAS) ?? '[]')
    return Array.isArray(salvo) ? salvo.filter((c): c is ColunaKey => COLUNAS_PADRAO.includes(c as ColunaKey)) : []
  } catch {
    return []
  }
}

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

/** Largura na tela de cada coluna visível. As ajustadas à mão ficam exatamente como foram deixadas;
 * as outras ocupam o espaço que sobra: sobrando (ex.: depois de ocultar colunas), crescem na mesma
 * proporção; faltando (ex.: barra lateral aberta), as de texto encolhem primeiro, até o mínimo de
 * cada uma (MINIMO_RELATIVO) — daí pra frente a planilha rola de lado. */
function calcularLarguras(
  visiveis: ColunaKey[],
  ajustadas: Partial<Record<ColunaKey, number>>,
  espaco: number,
): Record<ColunaKey, number> {
  const resultado = {} as Record<ColunaKey, number>
  const automaticas = visiveis.filter((c) => ajustadas[c] === undefined)
  let somaAjustadas = 0
  for (const c of visiveis) {
    const ajustada = ajustadas[c]
    if (ajustada !== undefined) {
      resultado[c] = ajustada
      somaAjustadas += ajustada
    }
  }
  if (espaco <= 0) {
    for (const c of automaticas) resultado[c] = LARGURA_PADRAO[c]
    return resultado
  }
  if (automaticas.length === 0) {
    // todas ajustadas à mão: só crescem juntas (na mesma proporção) se sobrar espaço na tela
    if (somaAjustadas > 0 && somaAjustadas < espaco) {
      for (const c of visiveis) resultado[c] = resultado[c] * (espaco / somaAjustadas)
    }
    return resultado
  }
  const espacoLivre = espaco - somaAjustadas
  const somaPadrao = automaticas.reduce((s, c) => s + LARGURA_PADRAO[c], 0)
  if (espacoLivre >= somaPadrao) {
    const fator = espacoLivre / somaPadrao
    for (const c of automaticas) resultado[c] = LARGURA_PADRAO[c] * fator
    return resultado
  }
  const podeEncolher = automaticas.reduce((s, c) => s + LARGURA_PADRAO[c] * (1 - MINIMO_RELATIVO[c]), 0)
  const quanto = podeEncolher > 0 ? Math.min(1, (somaPadrao - espacoLivre) / podeEncolher) : 0
  for (const c of automaticas) resultado[c] = LARGURA_PADRAO[c] * (1 - (1 - MINIMO_RELATIVO[c]) * quanto)
  return resultado
}

/** Grupo de fornecedor dos itens: o nome e a UF de origem (o mesmo fornecedor em outro estado é
 * outro grupo, com outro frete). Itens sem fornecedor ficam todos num grupo só, sem UF. */
function remetenteDoItem(item: QuoteItem): RemetenteFrete {
  const nome = item.product.fornecedor.trim()
  return nome ? { nome, uf: item.product.estadoOrigem } : { nome: '' }
}

function chaveDoGrupo(item: QuoteItem): string {
  const r = remetenteDoItem(item)
  return chaveFornecedorFrete(r.nome, r.uf)
}

/** Como o item aparece nas confirmações e na lista de excluídos. */
function descricaoDoItem(item: QuoteItem): string {
  const p = item.product
  const codigo = [p.interno.trim(), p.referencia.trim()].filter(Boolean).join(' / ')
  const nome = p.descricao.trim() || 'item sem descrição'
  return `${codigo ? `${codigo} — ` : ''}${nome}${p.fornecedor.trim() ? ` (${p.fornecedor.trim()})` : ''}`
}

/** Histórico de preço achado ao digitar Interno/Referência — mostrado logo abaixo da linha. */
interface HistoricoPreco {
  ultimoUso?: UltimoUsoDoProduto
  maisBarato?: ProdutoCotacaoHistorico
}

// valores especiais dos filtros (não colidem com nenhum valor real de célula)
const FILTRO_TODOS = '__todos__'
const FILTRO_VAZIO = '__vazio__'
const OPCAO_OCULTAR = '__ocultar__'

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
  onRemoveItems,
  itensExcluidos,
  onRestaurarItem,
  onPatchItem,
  onApplyMarginToAll,
  onGoToComparar,
  onSave,
  podeSalvar,
  salvoRecentemente,
  cotacaoId,
  onRecorteChange,
  children,
}: {
  items: QuoteItem[]
  activeItemId: string
  /** Só pro nome do arquivo ao gerar a planilha do fornecedor — ver handleGerarPlanilhaFornecedor. */
  maquina: string
  cliente: string
  onSelect: (id: string) => void
  onAdd: () => void
  /** Tira os itens da cotação — a confirmação acontece aqui antes de chamar. */
  onRemoveItems: (ids: string[]) => void
  /** Itens que saíram da cotação (mostrados no fim da tabela, com opção de trazer de volta). */
  itensExcluidos: Array<ItemExcluidoCotacao & { pendente: boolean }>
  onRestaurarItem: (itemId: string) => void
  onPatchItem: (id: string, patch: Partial<ProductInput>) => void
  onApplyMarginToAll: (lucroPct: number) => void
  onGoToComparar: () => void
  onSave: () => void
  /** false quando a cotação está travada por outro admin — desabilita o botão enquanto isso. */
  podeSalvar: boolean
  /** true por alguns segundos logo depois de salvar — mostra "Cotação salva!" ao lado do botão. */
  salvoRecentemente: boolean
  /** Id da cotação no servidor — sem ele (cotação ainda não salva) o frete por fornecedor fica só leitura. */
  cotacaoId?: string
  /** Avisa quais itens estão "em foco" (marcados no seletor, ou o que sobrou do filtro) — usado pra
   * "Valores dos produtos" mostrar só esses. undefined = todos. */
  onRecorteChange?: (recorte: { ids: string[]; motivo: string } | undefined) => void
  /** O que vem logo depois da planilha (Valores dos produtos etc.) — fica dentro do mesmo bloco pra
   * barra de cima (Salvar cotação e ações dos itens marcados) continuar à vista ao rolar até lá. */
  children?: ReactNode
}) {
  const [margemUnica, setMargemUnica] = useState('')
  // frete de cada fornecedor (o mesmo da aba Frete) — lido direto da cotação salva no servidor e
  // gravado direto lá a cada alteração, sem passar pelo "Salvar cotação"
  const [freteSalvo, setFreteSalvo] = useState<Pick<QuoteRecord, 'fretePorFornecedor' | 'freteTransportadoras'>>({})
  const [modoFrete, setModoFrete] = useState<ModoFrete>('pct')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedorAbertoId, setFornecedorAbertoId] = useState<string | null>(null)
  const [ordemColunas, setOrdemColunas] = useState<ColunaKey[]>(carregarOrdemColunas)
  const [colunaArrastada, setColunaArrastada] = useState<ColunaKey | null>(null)
  const [larguras, setLarguras] = useState<Partial<Record<ColunaKey, number>>>(carregarLarguras)
  const [colunasOcultas, setColunasOcultas] = useState<ColunaKey[]>(carregarOcultas)
  const [menuColunasAberto, setMenuColunasAberto] = useState(false)
  const menuColunasRef = useRef<HTMLDivElement>(null)
  const [colunaRedimensionando, setColunaRedimensionando] = useState<ColunaKey | null>(null)
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
  // no celular as ações dos marcados ficam recolhidas atrás de um botão — abertas, tomariam metade
  // da tela presas no topo
  const [acoesAbertasCelular, setAcoesAbertasCelular] = useState(false)
  const [excluidosAbertos, setExcluidosAbertos] = useState(false)
  // filtro por coluna — valor exato (o texto da célula) que tem que bater; coluna ausente = todos
  const [filtros, setFiltros] = useState<Partial<Record<ColunaKey, string>>>({})
  // fica aqui (e não dentro de cada linha) porque carregar o histórico costuma trocar o fornecedor
  // do item — e aí ele muda de grupo, a linha é remontada em outro lugar e perderia o aviso
  const [historicos, setHistoricos] = useState<Record<string, HistoricoPreco>>({})

  // --- medidas da tela pra barra fixa, o cabeçalho fixo e o ajuste das colunas -------------------
  const blocoRef = useRef<HTMLDivElement>(null)
  const barraRef = useRef<HTMLDivElement>(null)
  const cabecalhoRef = useRef<HTMLDivElement>(null)
  const corpoRef = useRef<HTMLDivElement>(null)
  const rolagemLateralRef = useRef<HTMLDivElement>(null)
  const [alturaBarra, setAlturaBarra] = useState(0)
  const [larguraVisivel, setLarguraVisivel] = useState(0)

  useLayoutEffect(() => {
    const barra = barraRef.current
    const corpo = corpoRef.current
    if (!barra || !corpo) return
    const medir = () => {
      const altura = barra.offsetHeight
      setAlturaBarra(altura)
      // quem está embaixo da barra (painel de resultado ao lado de Valores dos produtos) usa essa
      // altura pra grudar logo abaixo dela em vez de ficar escondido atrás
      blocoRef.current?.style.setProperty('--altura-barra-itens', `${altura}px`)
      setLarguraVisivel(corpo.clientWidth)
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(barra)
    observador.observe(corpo)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    listFornecedores()
      .then(setFornecedores)
      .catch(() => {
        // sugestão é só um extra — se o servidor estiver fora, o campo continua livre normalmente
      })
  }, [])

  useEffect(() => {
    if (!cotacaoId) {
      setFreteSalvo({})
      return
    }
    let cancelado = false
    buscarQuote(cotacaoId)
      .then((registro) => {
        if (!cancelado && registro) {
          setFreteSalvo({ fretePorFornecedor: registro.fretePorFornecedor, freteTransportadoras: registro.freteTransportadoras })
        }
      })
      .catch(() => {
        // sem servidor os espaços de frete só ficam vazios — o resto da tela segue normal
      })
    return () => {
      cancelado = true
    }
  }, [cotacaoId])

  function fretesDoFornecedor(remetente: RemetenteFrete) {
    return freteDoFornecedor({ items, ...freteSalvo }, remetente)
  }

  async function handleSalvarFrete(remetente: RemetenteFrete, transportadora: string, numero: string, valor: string) {
    if (!cotacaoId) return
    try {
      const existente = fretesDoFornecedor(remetente)[transportadora]
      const atualizado = await salvarFreteTransportadora(cotacaoId, remetente, transportadora, {
        camposPedido: existente?.camposPedido ?? {},
        valorCotacao: valor,
        numeroCotacao: numero,
      })
      setFreteSalvo({ fretePorFornecedor: atualizado.fretePorFornecedor, freteTransportadoras: atualizado.freteTransportadoras })
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar o frete no servidor.')
    }
  }

  async function handleLimparFrete(remetente: RemetenteFrete, transportadora: string) {
    if (!cotacaoId) return
    try {
      const atualizado = await limparCotacaoFreteTransportadora(cotacaoId, remetente, transportadora)
      setFreteSalvo({ fretePorFornecedor: atualizado.fretePorFornecedor, freteTransportadoras: atualizado.freteTransportadoras })
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar o frete no servidor.')
    }
  }

  function renderFrete(remetente: RemetenteFrete) {
    return (
      <FreteFornecedorSlots
        fretes={fretesDoFornecedor(remetente)}
        habilitado={!!cotacaoId}
        motivoDesabilitado="Salve a cotação pra registrar o frete."
        onSalvar={(transportadora, numero, valor) => handleSalvarFrete(remetente, transportadora, numero, valor)}
        onLimpar={(transportadora) => handleLimparFrete(remetente, transportadora)}
      />
    )
  }

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

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_LARGURAS_COLUNAS, JSON.stringify(larguras))
      localStorage.setItem(CHAVE_COLUNAS_OCULTAS, JSON.stringify(colunasOcultas))
    } catch {
      // idem — só não lembra na próxima vez
    }
  }, [larguras, colunasOcultas])

  useEffect(() => {
    if (!menuColunasAberto) return
    function fecharAoClicarFora(e: Event) {
      if (menuColunasRef.current && !menuColunasRef.current.contains(e.target as Node)) setMenuColunasAberto(false)
    }
    document.addEventListener('mousedown', fecharAoClicarFora)
    return () => document.removeEventListener('mousedown', fecharAoClicarFora)
  }, [menuColunasAberto])

  // --- colunas: quais aparecem e com que largura ------------------------------------------------
  const colunasVisiveis = useMemo(() => ordemColunas.filter((c) => !colunasOcultas.includes(c)), [ordemColunas, colunasOcultas])
  const larguraFixa = LARGURA_CHECKBOX + LARGURA_NUMERO
  // 1px de folga: com as frações de pixel das larguras, a tabela às vezes passava 1px da tela e
  // ganhava uma rolagem de lado à toa
  const espacoDasColunas = Math.max(0, larguraVisivel - larguraFixa - 1)
  const largurasNaTela = useMemo(
    () => calcularLarguras(colunasVisiveis, larguras, larguraVisivel > 0 ? espacoDasColunas : 0),
    [colunasVisiveis, larguras, larguraVisivel, espacoDasColunas],
  )
  const larguraNaTela = (chave: ColunaKey) => largurasNaTela[chave] ?? LARGURA_PADRAO[chave]
  const larguraTabela = larguraFixa + colunasVisiveis.reduce((s, c) => s + larguraNaTela(c), 0)
  // passou da largura da tela (colunas já no mínimo): a planilha rola de lado, com uma barra de
  // rolagem que acompanha a tela (presa embaixo) em vez de ficar lá no fim da planilha
  const rolaDeLado = larguraVisivel > 0 && larguraTabela > larguraVisivel + 0.5

  function ocultarColuna(chave: ColunaKey) {
    setColunasOcultas((prev) => (prev.includes(chave) ? prev : [...prev, chave]))
    // filtro numa coluna escondida continuaria filtrando sem ninguém ver — sai junto
    setFiltros((prev) => {
      if (!(chave in prev)) return prev
      const proximo = { ...prev }
      delete proximo[chave]
      return proximo
    })
  }

  function alternarColuna(chave: ColunaKey) {
    if (colunasOcultas.includes(chave)) setColunasOcultas((prev) => prev.filter((c) => c !== chave))
    else if (colunasVisiveis.length > 1) ocultarColuna(chave)
  }

  /** Arrastar a borda direita do título fixa a largura da coluna — a borda acompanha o mouse/dedo, e
   * as colunas que ninguém ajustou se adaptam pra planilha continuar ocupando a largura da tela. */
  function iniciarRedimensionar(e: ReactPointerEvent<HTMLSpanElement>, chave: ColunaKey) {
    e.preventDefault()
    e.stopPropagation()
    const inicioX = e.clientX
    const naTelaInicial = larguraNaTela(chave)
    setColunaRedimensionando(chave)
    const mover = (ev: PointerEvent) => {
      const nova = Math.max(LARGURA_MINIMA, Math.round(naTelaInicial + ev.clientX - inicioX))
      setLarguras((prev) => (prev[chave] === nova ? prev : { ...prev, [chave]: nova }))
    }
    const soltar = () => {
      setColunaRedimensionando(null)
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
  }

  function larguraPadraoDaColuna(chave: ColunaKey) {
    setLarguras((prev) => {
      const proximo = { ...prev }
      delete proximo[chave]
      return proximo
    })
  }

  // cabeçalho (preso no topo) e corpo da planilha são duas tabelas com as mesmas colunas — a
  // rolagem de lado de um acompanha a do outro, e a barra de rolagem presa embaixo da tela também
  function aoRolarCorpo() {
    const x = corpoRef.current?.scrollLeft ?? 0
    if (cabecalhoRef.current && cabecalhoRef.current.scrollLeft !== x) cabecalhoRef.current.scrollLeft = x
    if (rolagemLateralRef.current && rolagemLateralRef.current.scrollLeft !== x) rolagemLateralRef.current.scrollLeft = x
  }
  function aoRolarBarraLateral() {
    const x = rolagemLateralRef.current?.scrollLeft ?? 0
    if (corpoRef.current && corpoRef.current.scrollLeft !== x) corpoRef.current.scrollLeft = x
    if (cabecalhoRef.current && cabecalhoRef.current.scrollLeft !== x) cabecalhoRef.current.scrollLeft = x
  }

  // divisória vertical em toda célula — dá pra ver onde uma coluna termina e a outra começa
  const cellCls = 'px-1 py-1 border-t border-r border-ink-100'
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

  // --- agrupamento por fornecedor + UF -----------------------------------------
  // itens de fornecedores diferentes ficam em blocos separados, cada um com cabeçalho próprio
  // (nome, UF, quantidade de itens, subtotal, frete) — e o mesmo fornecedor em outro estado também é
  // outro bloco (outra origem, outro frete). Só agrupa quando há mais de um grupo na tela; com um
  // só, a tabela fica corrida, sem um cabeçalho de grupo que não separaria nada
  const grupos = useMemo(() => {
    const mapa = new Map<string, { remetente: RemetenteFrete; itens: QuoteItem[] }>()
    for (const item of itensFiltrados) {
      const chave = chaveDoGrupo(item)
      if (!mapa.has(chave)) mapa.set(chave, { remetente: remetenteDoItem(item), itens: [] })
      mapa.get(chave)!.itens.push(item)
    }
    return Array.from(mapa.entries()).map(([chave, g]) => ({ chave, ...g }))
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

  // "Valores dos produtos" acompanha o que está em foco aqui: os itens marcados no seletor (um a um
  // ou o fornecedor inteiro pelo seletor do tópico dele); sem marcação, o que sobrou dos filtros;
  // sem nenhum dos dois, todos os itens
  const recorte = useMemo((): { ids: string[]; motivo: string } | undefined => {
    if (idsMarcados.length > 0) {
      const gruposMarcados = new Set(items.filter((i) => marcados.has(i.id)).map(chaveDoGrupo))
      if (gruposMarcados.size === 1) {
        const [chave] = Array.from(gruposMarcados)
        const doGrupo = items.filter((i) => chaveDoGrupo(i) === chave)
        const remetente = doGrupo[0] ? remetenteDoItem(doGrupo[0]) : undefined
        if (remetente?.nome && doGrupo.every((i) => marcados.has(i.id))) {
          const nome = rotuloRemetente(remetente, items.map(remetenteDoItem))
          return { ids: idsMarcados, motivo: `fornecedor ${nome} marcado` }
        }
      }
      return { ids: idsMarcados, motivo: idsMarcados.length === 1 ? 'o item marcado' : 'os itens marcados' }
    }
    if (filtrosAtivos) {
      return {
        ids: itensFiltrados.map((i) => i.id),
        motivo: `filtrado por ${(Object.keys(filtros) as ColunaKey[]).map((c) => LABEL_COLUNA[c]).join(', ')}`,
      }
    }
    return undefined
  }, [idsMarcados, items, marcados, filtrosAtivos, itensFiltrados, filtros])
  const chaveRecorte = recorte ? `${recorte.motivo}|${recorte.ids.join(',')}` : ''
  useEffect(() => {
    onRecorteChange?.(recorte)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveRecorte])

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

  // excluir só existe pros itens marcados, sempre com confirmação listando o que vai sair — e o
  // item não some do sistema: vai pro arquivo de excluídos da cotação (no servidor), de onde dá pra
  // trazer de volta
  async function handleExcluirMarcados() {
    const alvo = items.filter((item) => marcados.has(item.id))
    if (alvo.length === 0) return
    const lista =
      alvo
        .slice(0, 8)
        .map((item) => `• ${descricaoDoItem(item)}`)
        .join('\n') + (alvo.length > 8 ? `\n• … e mais ${alvo.length - 8}` : '')
    const umSo = alvo.length === 1
    const confirmado = await confirmar(
      `${umSo ? 'Excluir este item da cotação?' : `Excluir estes ${alvo.length} itens da cotação?`}\n\n${lista}\n\n` +
        `${umSo ? 'Ele sai' : 'Eles saem'} da cotação mas ${umSo ? 'continua guardado' : 'continuam guardados'} no sistema — ` +
        `${umSo ? 'fica' : 'ficam'} em "Itens excluídos", no fim da planilha, e dá pra restaurar.`,
      { titulo: umSo ? 'Excluir item' : 'Excluir itens', confirmText: 'Excluir', tone: 'danger' },
    )
    if (!confirmado) return
    onRemoveItems(alvo.map((item) => item.id))
    setMarcados(new Set())
    setAcoesAbertasCelular(false)
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

  /** O filtro mora no próprio título da coluna: uma setinha ao lado do nome abre a lista de valores
   * (um <select> nativo invisível por cima da setinha — no celular abre o seletor do sistema). Com
   * filtro ativo, a setinha fica preenchida e o valor escolhido aparece logo abaixo do nome. */
  function renderFiltroNoTitulo(chave: ColunaKey) {
    const ativo = chave in filtros
    const valorAtual = filtros[chave]
    const valorSelect = !ativo ? FILTRO_TODOS : valorAtual === '' ? FILTRO_VAZIO : (valorAtual as string)
    return (
      <span className="relative inline-flex shrink-0" onMouseDown={(e) => e.stopPropagation()}>
        <span
          aria-hidden
          className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] leading-none transition ${
            ativo ? 'bg-ink-900 text-surface' : 'text-ink-300 group-hover:text-ink-500'
          }`}
        >
          ▾
        </span>
        <select
          value={valorSelect}
          onChange={(e) => {
            if (e.target.value === OPCAO_OCULTAR) ocultarColuna(chave)
            else setFiltro(chave, e.target.value)
          }}
          title={`Filtrar por ${LABEL_COLUNA[chave]}`}
          aria-label={`Filtrar por ${LABEL_COLUNA[chave]}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          <option value={FILTRO_TODOS}>Todos</option>
          {valoresPorColuna[chave].map((v) => (
            <option key={v || FILTRO_VAZIO} value={v || FILTRO_VAZIO}>
              {v || '(vazio)'}
            </option>
          ))}
          {colunasVisiveis.length > 1 && (
            <>
              <option disabled>──────────</option>
              <option value={OPCAO_OCULTAR}>Ocultar esta coluna</option>
            </>
          )}
        </select>
      </span>
    )
  }

  function renderCabecalho(chave: ColunaKey) {
    const ativo = chave in filtros
    const valorFiltro = filtros[chave]
    const alinhadoDireita = ALINHADA_DIREITA.has(chave)
    const conteudo =
      chave === 'frete' ? (
        <div className="flex items-center justify-end gap-1">
          <span className={`min-w-0 overflow-hidden leading-tight ${ativo ? 'font-semibold text-ink-900 underline decoration-dotted underline-offset-2' : ''}`}>
            Frete
          </span>
          {renderFiltroNoTitulo(chave)}
          <span className="inline-flex rounded-md border border-ink-200 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setModoFrete('pct')}
              className={`px-1.5 py-0.5 text-[10px] font-medium transition ${
                modoFrete === 'pct' ? 'bg-ink-950 text-white' : 'bg-surface text-ink-500 hover:bg-ink-50'
              }`}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => setModoFrete('valor')}
              className={`px-1.5 py-0.5 text-[10px] font-medium border-l border-ink-200 transition ${
                modoFrete === 'valor' ? 'bg-ink-950 text-white' : 'bg-surface text-ink-500 hover:bg-ink-50'
              }`}
            >
              R$
            </button>
          </span>
        </div>
      ) : (
        <div className={`flex min-w-0 items-center gap-1 ${alinhadoDireita ? 'justify-end' : ''}`}>
          <span className={`min-w-0 overflow-hidden leading-tight ${ativo ? 'font-semibold text-ink-900 underline decoration-dotted underline-offset-2' : ''}`}>
            {LABEL_COLUNA[chave]}
          </span>
          {renderFiltroNoTitulo(chave)}
        </div>
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
        title="Arraste pra reordenar as colunas — a setinha ao lado do nome filtra (ou oculta a coluna) e a borda da direita muda a largura"
        className={`group relative py-2 pl-1.5 pr-2.5 text-[13px] font-medium cursor-move select-none border-r border-ink-200 transition ${
          alinhadoDireita ? 'text-right' : ''
        } ${colunaArrastada === chave ? 'opacity-40' : ''}`}
      >
        {conteudo}
        {ativo && (
          <div
            className={`mt-0.5 truncate text-[10px] font-semibold normal-case text-ink-600 ${alinhadoDireita ? 'text-right' : ''}`}
            title={valorFiltro || '(vazio)'}
          >
            = {valorFiltro || '(vazio)'}
          </div>
        )}
        {/* alça de largura: borda direita do título (arrastar muda, duplo clique volta ao padrão) */}
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Largura da coluna ${LABEL_COLUNA[chave]}`}
          title="Arraste pra mudar a largura (duplo clique volta ao tamanho padrão)"
          draggable={false}
          onDragStart={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onPointerDown={(e) => iniciarRedimensionar(e, chave)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            larguraPadraoDaColuna(chave)
          }}
          className="absolute -right-1 top-0 z-10 flex h-full w-2.5 cursor-col-resize touch-none justify-center"
        >
          <span
            className={`h-full w-0.5 transition ${
              colunaRedimensionando === chave ? 'bg-brand-600' : 'bg-transparent group-hover:bg-ink-300 hover:!bg-brand-600'
            }`}
          />
        </span>
      </th>
    )
  }

  const totalColunas = colunasVisiveis.length + 2

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
        onPatch={(patch) => onPatchItem(item.id, patch)}
        cellCls={cellCls}
        inputCls={inputCls}
        stop={stop}
        ordemColunas={colunasVisiveis}
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

  function renderSeloUf(uf: string | undefined) {
    if (!uf) return null
    return (
      <span
        title="Estado de onde o fornecedor despacha — o mesmo fornecedor em outro estado fica em outro grupo, com outro frete"
        className="rounded border border-ink-300 px-1 py-px font-mono text-[10px] font-semibold text-ink-600"
      >
        {uf}
      </span>
    )
  }

  const colgroup = (
    <colgroup>
      <col style={{ width: LARGURA_CHECKBOX }} />
      <col style={{ width: LARGURA_NUMERO }} />
      {colunasVisiveis.map((chave) => (
        <col key={chave} style={{ width: larguraNaTela(chave) }} />
      ))}
    </colgroup>
  )
  const estiloTabela = { tableLayout: 'fixed' as const, width: larguraTabela }
  // o que é preso no topo ao rolar a tela: a barra de cima (na altura da barra do celular, que no
  // computador é 0) e, logo abaixo dela, o cabeçalho da planilha
  const topoCabecalho = `calc(var(--altura-topo) + ${alturaBarra}px)`
  const btnBarraCls =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-medium transition'
  const acaoMarcadosCls = 'pill-tab border border-brand-600 bg-brand-600 py-1.5 text-white hover:bg-brand-700'

  return (
    <div ref={blocoRef}>
      {/* barra fixa: título, Salvar cotação e, com itens marcados, as ações em lote — acompanha a
       * rolagem da tela até o fim de Valores dos produtos, então dá pra salvar ou aplicar algo nos
       * marcados sem precisar voltar lá em cima */}
      <div
        ref={barraRef}
        className="sticky z-10 rounded-t-2xl border border-ink-100 bg-surface px-4 py-3 shadow-[0_8px_14px_-12px_rgba(0,0,0,0.45)] sm:px-6"
        style={{ top: 'var(--altura-topo)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink-900">
            Itens da cotação
            <span className="ml-2 font-sans text-xs font-normal text-ink-400">
              {items.length} ite{items.length === 1 ? 'm' : 'ns'}
            </span>
          </h2>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {salvoRecentemente && <span className="text-xs font-medium text-emerald-600">✓ Cotação salva!</span>}
            <button
              type="button"
              onClick={onGoToComparar}
              className={`${btnBarraCls} border border-ink-200 text-ink-700 hover:bg-ink-50`}
            >
              <span className="sm:hidden">Comparar</span>
              <span className="hidden sm:inline">Comparar fornecedores</span>
            </button>
            <button
              type="button"
              onClick={onAdd}
              className={`${btnBarraCls} border border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}
            >
              + Adicionar item
            </button>
            <Button variant="primary" onClick={onSave} disabled={!podeSalvar} className="px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm">
              Salvar cotação
            </Button>
          </div>
        </div>

        {idsMarcados.length > 0 && (
          <div className="mt-2.5 rounded-lg border border-ink-300 bg-ink-100 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ink-800">
                {idsMarcados.length} {idsMarcados.length > 1 ? 'itens marcados' : 'item marcado'}
              </span>
              <button
                type="button"
                onClick={() => setAcoesAbertasCelular((v) => !v)}
                aria-expanded={acoesAbertasCelular}
                className="pill-tab border border-ink-300 py-1 text-xs text-ink-700 sm:hidden"
              >
                Ações {acoesAbertasCelular ? '▴' : '▾'}
              </button>
              <div className={`${acoesAbertasCelular ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto sm:flex-1`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative">
                    <input
                      type="text"
                      placeholder="Nome do fornecedor"
                      value={fornecedorBulk}
                      onChange={(e) => {
                        setFornecedorBulk(e.target.value)
                        setFornecedorBulkAberto(true)
                      }}
                      onFocus={() => setFornecedorBulkAberto(true)}
                      onBlur={() => setFornecedorBulkAberto(false)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAplicarFornecedorBulkDigitado()}
                      className="field-input w-44 py-1 text-sm"
                    />
                    {fornecedorBulkAberto && sugestoesFornecedorBulk.length > 0 && (
                      <div
                        className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-ink-200 bg-surface shadow-lg max-h-56 overflow-auto"
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
                            {f.cidade ? (
                              <span className="text-ink-400">
                                {' '}
                                — {f.cidade}
                                {f.estado ? ` / ${f.estado}` : ''}
                              </span>
                            ) : f.estado ? (
                              <span className="text-ink-400"> — {f.estado}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                  <button type="button" onClick={handleAplicarFornecedorBulkDigitado} className={acaoMarcadosCls}>
                    Aplicar fornecedor
                  </button>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Marca"
                    value={marcaBulk}
                    onChange={(e) => setMarcaBulk(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAplicarMarcaAosMarcados()}
                    className="field-input w-28 py-1 text-sm"
                  />
                  <button type="button" onClick={handleAplicarMarcaAosMarcados} className={acaoMarcadosCls}>
                    Aplicar marca
                  </button>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="NCM"
                    value={ncmBulk}
                    onChange={(e) => setNcmBulk(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAplicarNcmAosMarcados()}
                    className="field-input w-28 py-1 text-sm font-mono"
                  />
                  <button type="button" onClick={handleAplicarNcmAosMarcados} className={acaoMarcadosCls}>
                    Aplicar NCM
                  </button>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="number"
                    step={0.01}
                    placeholder={modoFrete === 'pct' ? 'Frete %' : 'Frete R$'}
                    value={freteBulk}
                    onChange={(e) => setFreteBulk(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAplicarFreteAosMarcados()}
                    className="field-input w-24 py-1 text-sm text-right tabular-nums"
                  />
                  <button type="button" onClick={handleAplicarFreteAosMarcados} className={acaoMarcadosCls}>
                    Aplicar frete
                  </button>
                </span>
                <span className="hidden w-px self-stretch bg-ink-300 sm:block" />
                <button
                  type="button"
                  onClick={() => setMarcados(new Set())}
                  className="pill-tab border border-ink-300 py-1.5 text-ink-600 hover:bg-surface"
                >
                  Limpar marcação
                </button>
                <button
                  type="button"
                  onClick={handleGerarPlanilhaFornecedor}
                  title="Mostra uma prévia da planilha (.xlsx) só com os itens marcados, no formato de orçamento pra pedir preço ao fornecedor"
                  className="pill-tab border border-ink-300 py-1.5 text-ink-700 hover:bg-surface"
                >
                  Gerar planilha do fornecedor (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleExcluirMarcados}
                  title="Tira os itens marcados da cotação (pede confirmação; eles ficam guardados em Itens excluídos)"
                  className="pill-tab border border-rose-300 py-1.5 text-rose-700 hover:bg-rose-50 dark:border-rose-500/60 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  Excluir selecionado{idsMarcados.length > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card rounded-t-none border-t-0">
        <p className="mb-3 text-sm text-ink-400">
          Edite direto na planilha — arraste o título de uma coluna pra reordenar, e use a setinha ▾ ao lado do nome
          dela pra filtrar. Pra excluir, marque os itens: a opção aparece na barra de cima.
        </p>

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
              className="pill-tab border border-ink-200 text-ink-600 hover:bg-surface"
            >
              Aplicar a todos
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

        {/* com um fornecedor só não há cabeçalho de grupo — o frete dele fica aqui em cima */}
        {!agrupar && grupos.length === 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-4 border-ink-900 bg-ink-50 py-1.5 pl-2.5 pr-3">
            {grupos[0].remetente.nome && (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-display text-[13px] font-bold uppercase tracking-wide text-ink-900">
                  {grupos[0].remetente.nome}
                </span>
                {renderSeloUf(grupos[0].remetente.uf)}
              </span>
            )}
            <span className={`flex flex-wrap items-center gap-1.5 ${grupos[0].remetente.nome ? 'border-l border-ink-200 pl-3' : ''}`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Frete</span>
              {renderFrete(grupos[0].remetente)}
            </span>
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <div className="relative" ref={menuColunasRef}>
            <button
              type="button"
              onClick={() => setMenuColunasAberto((v) => !v)}
              aria-expanded={menuColunasAberto}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                colunasOcultas.length > 0 ? 'border-ink-400 bg-ink-100 text-ink-900' : 'border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              Colunas{colunasOcultas.length > 0 ? ` (${colunasOcultas.length} oculta${colunasOcultas.length > 1 ? 's' : ''})` : ''}
              <span aria-hidden>▾</span>
            </button>
            {menuColunasAberto && (
              <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-ink-200 bg-surface p-2 shadow-lg">
                <p className="px-1.5 pb-1 text-[11px] text-ink-400">Marque as colunas que aparecem na tabela:</p>
                <div className="max-h-72 overflow-y-auto">
                  {ordemColunas.map((chave) => {
                    const visivel = !colunasOcultas.includes(chave)
                    return (
                      <label
                        key={chave}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink-800 hover:bg-ink-50"
                      >
                        <input
                          type="checkbox"
                          checked={visivel}
                          disabled={visivel && colunasVisiveis.length === 1}
                          onChange={() => alternarColuna(chave)}
                        />
                        {LABEL_COLUNA[chave]}
                      </label>
                    )
                  })}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 border-t border-ink-100 px-1.5 pt-2">
                  <button
                    type="button"
                    disabled={colunasOcultas.length === 0}
                    onClick={() => setColunasOcultas([])}
                    className="rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                  >
                    Mostrar todas
                  </button>
                  <button
                    type="button"
                    disabled={Object.keys(larguras).length === 0}
                    onClick={() => setLarguras({})}
                    className="rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                  >
                    Larguras padrão
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* a planilha: cabeçalho e corpo em tabelas separadas com as mesmas colunas (larguras fixas
         * via table-layout: fixed + colgroup) — o cabeçalho fica preso logo abaixo da barra de cima
         * enquanto a planilha rola com a tela, e a rolagem de lado dos dois anda junto */}
        <div className="rounded-xl border border-ink-100">
          <div
            ref={cabecalhoRef}
            className="sticky z-[5] overflow-hidden rounded-t-xl border-b border-ink-200 bg-ink-50"
            style={{ top: topoCabecalho }}
            onWheel={(e) => {
              // rolar de lado em cima do cabeçalho (trackpad, shift+roda) move a planilha junto
              if (e.deltaX && corpoRef.current) corpoRef.current.scrollLeft += e.deltaX
            }}
          >
            <table className="text-sm border-collapse" style={estiloTabela}>
              {colgroup}
              <thead>
                <tr className="text-left text-ink-400">
                  <th className="py-2 px-2 border-r border-ink-200">
                    <input
                      type="checkbox"
                      checked={todosVisiveisMarcados}
                      onChange={() => toggleConjunto(idsVisiveis)}
                      title="Marcar/desmarcar todos os itens visíveis"
                    />
                  </th>
                  <th className="py-2 px-2 font-medium border-r border-ink-200">#</th>
                  {colunasVisiveis.map((chave) => renderCabecalho(chave))}
                </tr>
              </thead>
            </table>
          </div>
          <div
            ref={corpoRef}
            onScroll={aoRolarCorpo}
            className={`sem-barra-rolagem overflow-x-auto ${rolaDeLado ? '' : 'rounded-b-xl'}`}
          >
            <table className="text-sm border-collapse" style={estiloTabela}>
              {colgroup}
              <tbody>
                {itensFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={totalColunas} className="py-6 text-center text-sm text-ink-400">
                      {items.length === 0 ? 'Nenhum item na cotação.' : 'Nenhum item com esses filtros.'}
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
                        <Fragment key={grupo.chave || '__sem_fornecedor__'}>
                          {/* cabeçalho do grupo como um "tópico" dos itens logo abaixo: barra lateral,
                           * nome do fornecedor (e a UF de onde ele despacha) em destaque e, na mesma
                           * linha, o frete dele (até 3 cotações de transportadora) — preso na
                           * esquerda da área visível, então continua à vista mesmo com a planilha
                           * rolada de lado */}
                          <tr>
                            <td colSpan={totalColunas} className="px-0 pt-3 pb-0 border-t border-ink-100">
                              <div
                                className="sticky left-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-4 border-ink-900 bg-ink-50 py-1.5 pl-2 pr-3"
                                style={rolaDeLado && larguraVisivel > 0 ? { width: larguraVisivel } : undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={grupoMarcado}
                                  onChange={() => toggleConjunto(idsGrupo)}
                                  title="Marcar/desmarcar todos os itens desse fornecedor"
                                />
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="font-display text-[13px] font-bold uppercase tracking-wide text-ink-900">
                                    {grupo.remetente.nome || 'Sem fornecedor definido'}
                                  </span>
                                  {grupo.remetente.nome && renderSeloUf(grupo.remetente.uf)}
                                </span>
                                <span className="text-[11px] text-ink-500">
                                  {grupo.itens.length} {grupo.itens.length > 1 ? 'itens' : 'item'} ·{' '}
                                  <span className="font-mono font-semibold tabular-nums text-ink-900">{formatCurrency(subtotal)}</span>
                                </span>
                                {grupo.remetente.nome && (
                                  <span className="flex flex-wrap items-center gap-1.5 border-l border-ink-200 pl-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Frete</span>
                                    {renderFrete(grupo.remetente)}
                                  </span>
                                )}
                              </div>
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
          {rolaDeLado && (
            // barra de rolagem de lado presa embaixo da tela enquanto a planilha estiver à vista —
            // sem ela, pra ver as colunas da direita era preciso descer até o fim da planilha
            <div
              ref={rolagemLateralRef}
              onScroll={aoRolarBarraLateral}
              className="sticky bottom-0 z-[5] overflow-x-auto overflow-y-hidden rounded-b-xl border-t border-ink-100 bg-surface"
            >
              {/* +2px: a borda da tabela soma uma fração de pixel — sem a folga, a barra parava 1px antes do fim */}
              <div style={{ width: larguraTabela + 2, height: 1 }} />
            </div>
          )}
        </div>

        {itensExcluidos.length > 0 && (
          <div className="mt-4 rounded-xl border border-ink-100">
            <button
              type="button"
              onClick={() => setExcluidosAbertos((v) => !v)}
              aria-expanded={excluidosAbertos}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50 rounded-xl"
            >
              <span>
                Itens excluídos desta cotação <span className="font-semibold text-ink-900">({itensExcluidos.length})</span>
                <span className="ml-2 text-xs text-ink-400">guardados no sistema — dá pra restaurar</span>
              </span>
              <span aria-hidden className="text-ink-400">
                {excluidosAbertos ? '▴' : '▾'}
              </span>
            </button>
            {excluidosAbertos && (
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {itensExcluidos.map((excluido) => {
                  const p = excluido.item.product
                  return (
                    <li key={excluido.item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 text-ink-800">{descricaoDoItem(excluido.item)}</span>
                      <span className="font-mono text-xs tabular-nums text-ink-500">
                        {p.qtd || 0} × {formatCurrency(p.valorUnt || 0)}
                      </span>
                      <span className={`text-xs ${excluido.pendente ? 'text-amber-700' : 'text-ink-400'}`}>
                        {excluido.pendente
                          ? 'tirado agora — sai da cotação ao salvar'
                          : `excluído${excluido.excluidoPor ? ` por ${excluido.excluidoPor}` : ''} em ${formatDate(excluido.excluidoEm)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRestaurarItem(excluido.item.id)}
                        className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
                      >
                        Restaurar
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {children}
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
  onPatch,
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
  onPatch: (patch: Partial<ProductInput>) => void
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
      <td key="precoVenda" className={`${cellCls} truncate text-right font-mono tabular-nums text-ink-800`}>
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
      <td key="total" className={`${cellCls} truncate text-right font-mono tabular-nums text-ink-800 pr-3`}>
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
        className={`cursor-pointer transition ${isActive ? 'bg-ink-100' : marcado ? 'bg-ink-50' : 'hover:bg-ink-50'}`}
      >
        <td className={`${cellCls} text-center`} onClick={stop}>
          <input type="checkbox" checked={marcado} onChange={onToggleMarcado} />
        </td>
        <td className={`${cellCls} text-ink-400 text-xs text-center`}>{numero}</td>
        {ordemColunas.map((chave) => celulas[chave])}
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
