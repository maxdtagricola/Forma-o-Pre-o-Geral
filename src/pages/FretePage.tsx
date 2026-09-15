import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Basics'
import { SelectField } from '../components/ui/Field'
import { getEmpresaPorTransportadora, setEmpresaPorTransportadora } from '../db/configRepo'
import { listEmpresas } from '../db/empresasRepo'
import { listFornecedores } from '../db/fornecedoresRepo'
import { listQuotes } from '../db/analysesRepo'
import { formatCurrency, formatNumber } from '../utils'
import { TRANSPORTADORAS } from '../types'
import type { Empresa, Fornecedor, QuoteRecord } from '../types'

// ---------------------------------------------------------------------------
// Cada transportadora pede um conjunto diferente de dados pro pedido de frete
// (modelos passados pelo usuário). O que dá pra descobrir sozinho (CNPJ/CEP do
// fornecedor e da empresa destino, peso/valor/volumes da cotação) vem pronto;
// o resto fica em branco pra preencher na hora.
// ---------------------------------------------------------------------------
interface ContextoFrete {
  temCotacao: boolean
  fornecedor: Fornecedor | null
  empresa: Empresa | null
  pesoTotal: number
  valorNF: number
  qtdVolumes: number
  descricao: string
}

interface CampoFrete {
  chave: string
  label: string
  valorInicial: (ctx: ContextoFrete) => string
}

const contextoVazio: ContextoFrete = {
  temCotacao: false,
  fornecedor: null,
  empresa: null,
  pesoTotal: 0,
  valorNF: 0,
  qtdVolumes: 0,
  descricao: '',
}

function enderecoDestino(e: Empresa | null): string {
  if (!e) return ''
  return [e.endereco, e.bairro].filter(Boolean).join(', ')
}
function cidadeUf(municipio?: string, uf?: string): string {
  if (!municipio && !uf) return ''
  return [municipio, uf].filter(Boolean).join(' / ')
}

const CAMPOS_POR_TRANSPORTADORA: Record<string, CampoFrete[]> = {
  EUCATUR: [
    { chave: 'modalidade', label: 'Modalidade de transporte (Ônibus / Caminhão)', valorInicial: () => '' },
    { chave: 'cnpjRemetente', label: 'CNPJ/CPF do remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ/CPF do destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'pagador', label: 'Responsável pelo pagamento (CIF / FOB)', valorInicial: () => '' },
    { chave: 'cepOrigem', label: 'CEP de origem', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'cepDestino', label: 'CEP de destino', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'valorNF', label: 'Valor da Nota Fiscal (NFe)', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'volumes', label: 'Quantidade de volumes', valorInicial: (c) => String(c.qtdVolumes || '') },
    { chave: 'pesoBruto', label: 'Peso bruto', valorInicial: (c) => (c.pesoTotal ? `${formatNumber(c.pesoTotal, 2)} kg` : '') },
    { chave: 'comprimento', label: 'Medida — comprimento', valorInicial: () => '' },
    { chave: 'largura', label: 'Medida — largura', valorInicial: () => '' },
    { chave: 'altura', label: 'Medida — altura', valorInicial: () => '' },
    { chave: 'descricaoProduto', label: 'Descrição do produto', valorInicial: (c) => c.descricao },
  ],
  VAPTLOG: [
    { chave: 'cidadeOrigem', label: 'Cidade origem', valorInicial: (c) => c.fornecedor?.cidade ?? '' },
    { chave: 'destino', label: 'Destino', valorInicial: (c) => cidadeUf(c.empresa?.municipio, c.empresa?.uf) },
    { chave: 'peso', label: 'Peso', valorInicial: (c) => (c.pesoTotal ? `${formatNumber(c.pesoTotal, 2)} kg` : '') },
    { chave: 'alturaTotal', label: 'Medidas — altura total', valorInicial: () => '' },
    { chave: 'comprimento', label: 'Medidas — comprimento', valorInicial: () => '' },
    { chave: 'largura', label: 'Medidas — largura', valorInicial: () => '' },
    { chave: 'valorNota', label: 'Valor da nota', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'cnpjRemetente', label: 'CNPJ remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'pagador', label: 'Pagador do frete', valorInicial: () => '' },
    { chave: 'email', label: 'E-mail', valorInicial: () => '' },
  ],
  CARVALIMA: [
    { chave: 'cnpjPagador', label: 'CNPJ do pagador do frete', valorInicial: () => '' },
    { chave: 'cnpjRemetente', label: 'CNPJ do remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ do destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'cepOrigem', label: 'CEP de origem', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'cepDestino', label: 'CEP de destino', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'tipoMaterial', label: 'Tipo de material', valorInicial: () => '' },
    { chave: 'tipoEmbalagem', label: 'Tipo de embalagem', valorInicial: () => '' },
    { chave: 'valorNF', label: 'Valor da nota fiscal', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'volumes', label: 'Quantidade de volumes', valorInicial: (c) => String(c.qtdVolumes || '') },
    { chave: 'pesoTotal', label: 'Peso total dos volumes', valorInicial: (c) => (c.pesoTotal ? `${formatNumber(c.pesoTotal, 2)} kg` : '') },
    { chave: 'cubagem', label: 'Cubagem (altura, largura, comprimento)', valorInicial: () => '' },
  ],
  RODONAVES: [
    { chave: 'cidadeOrigem', label: 'Cidade origem', valorInicial: (c) => c.fornecedor?.cidade ?? '' },
    { chave: 'cepOrigem', label: 'CEP (origem)', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'enderecoDestino', label: 'Destino da entrega — endereço', valorInicial: (c) => enderecoDestino(c.empresa) },
    { chave: 'bairroDestino', label: 'Bairro', valorInicial: (c) => c.empresa?.bairro ?? '' },
    { chave: 'cepDestino', label: 'CEP (destino)', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'cidadeUfDestino', label: 'Cidade/UF (destino)', valorInicial: (c) => cidadeUf(c.empresa?.municipio, c.empresa?.uf) },
    { chave: 'peso', label: 'Peso', valorInicial: (c) => (c.pesoTotal ? `${formatNumber(c.pesoTotal, 2)} kg` : '') },
    { chave: 'volumes', label: 'Volumes', valorInicial: (c) => String(c.qtdVolumes || '') },
    { chave: 'valorTotalNF', label: 'Valor total NF', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'medidas', label: 'Medidas', valorInicial: () => '' },
    { chave: 'cnpjRemetente', label: 'CNPJ remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'pagador', label: 'Pagador do frete', valorInicial: () => '' },
    { chave: 'email', label: 'E-mail', valorInicial: () => '' },
  ],
  // modelo da Granexpress ainda não recebido — usa os campos comuns às outras por enquanto
  GRANEXPRESS: [
    { chave: 'cnpjRemetente', label: 'CNPJ remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'cepOrigem', label: 'CEP de origem', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'cepDestino', label: 'CEP de destino', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'valorNF', label: 'Valor da nota fiscal', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'volumes', label: 'Quantidade de volumes', valorInicial: (c) => String(c.qtdVolumes || '') },
    { chave: 'peso', label: 'Peso', valorInicial: (c) => (c.pesoTotal ? `${formatNumber(c.pesoTotal, 2)} kg` : '') },
    { chave: 'medidas', label: 'Medidas', valorInicial: () => '' },
    { chave: 'pagador', label: 'Pagador do frete', valorInicial: () => '' },
  ],
}

function FormularioFrete({ transportadora, ctx }: { transportadora: string; ctx: ContextoFrete }) {
  const campos = CAMPOS_POR_TRANSPORTADORA[transportadora] ?? []
  const [valores, setValores] = useState<Record<string, string>>({})
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const iniciais: Record<string, string> = {}
    for (const campo of campos) iniciais[campo.chave] = campo.valorInicial(ctx)
    setValores(iniciais)
    setCopiado(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportadora, ctx])

  async function handleCopiar() {
    const texto = campos.map((c) => `${c.label}: ${valores[c.chave] ?? ''}`).join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      alert('Não foi possível copiar automaticamente — selecione e copie manualmente.')
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-ink-200 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campos.map((campo) => (
          <label key={campo.chave}>
            <span className="field-label">{campo.label}</span>
            <input
              type="text"
              className="field-input"
              value={valores[campo.chave] ?? ''}
              onChange={(e) => setValores((prev) => ({ ...prev, [campo.chave]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleCopiar}>
          Copiar dados
        </Button>
        {copiado && <span className="text-xs text-emerald-600">Copiado!</span>}
      </div>
    </div>
  )
}

function CardTransportadora({
  nome,
  empresas,
  empresaId,
  onChangeEmpresa,
  ctx,
  aberta,
  onToggle,
}: {
  nome: string
  empresas: Empresa[]
  empresaId: string
  onChangeEmpresa: (empresaId: string) => void
  ctx: ContextoFrete
  aberta: boolean
  onToggle: () => void
}) {
  const empresa = empresas.find((e) => e.id === empresaId)
  const empresaOptions = [{ value: '', label: '— selecione —' }, ...empresas.map((e) => ({ value: e.id, label: e.nome }))]

  return (
    <div className="card">
      <h3 className="font-display text-base font-semibold text-ink-900 mb-3">{nome}</h3>
      <SelectField
        label="Empresa destino padrão"
        value={empresaId}
        onChange={onChangeEmpresa}
        options={empresaOptions}
        hint={empresas.length === 0 ? 'Cadastre empresas em Configurações' : 'Usada quando a cotação não define uma empresa'}
      />
      {empresa && (
        <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50 p-3 text-xs text-ink-600">
          <p className="font-medium text-ink-800">{empresa.nome}</p>
          <p>CNPJ {empresa.cnpj || '—'}</p>
          <p>
            {empresa.endereco || '—'}
            {empresa.bairro ? ` · ${empresa.bairro}` : ''}
          </p>
          <p>
            {empresa.cep || '—'} · {empresa.municipio || '—'}
            {empresa.municipio && empresa.uf ? ' - ' : ''}
            {empresa.uf || ''}
          </p>
        </div>
      )}
      <button type="button" onClick={onToggle} className="mt-3 text-xs font-medium text-ink-600 underline hover:text-ink-900">
        {aberta ? 'Ocultar dados de pedido de frete' : 'Gerar dados de pedido de frete'}
      </button>
      {aberta && <FormularioFrete transportadora={nome} ctx={ctx} />}
    </div>
  )
}

export function FretePage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [empresaPorTransportadora, setEmpresaPorTransportadoraState] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [cotacaoId, setCotacaoId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [transportadoraAberta, setTransportadoraAberta] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listEmpresas(), listFornecedores(), listQuotes(), getEmpresaPorTransportadora()])
      .then(([listaEmpresas, listaFornecedores, listaQuotes, mapa]) => {
        setEmpresas(listaEmpresas)
        setFornecedores(listaFornecedores)
        setQuotes(listaQuotes)
        setEmpresaPorTransportadoraState(mapa)
      })
      .catch((err) => alert(err instanceof Error ? err.message : 'Erro ao carregar dados do servidor.'))
      .finally(() => setLoading(false))
  }, [])

  const cotacaoSelecionada = useMemo(() => quotes.find((q) => q.id === cotacaoId), [quotes, cotacaoId])

  // nomes de fornecedor distintos usados nos itens da cotação — só pra sugerir automaticamente
  // quando há um só; com mais de um, quem escolhe é o usuário mesmo
  const nomesFornecedorNaCotacao = useMemo(() => {
    if (!cotacaoSelecionada) return []
    const nomes = new Set(cotacaoSelecionada.items.map((it) => it.product.fornecedor.trim()).filter(Boolean))
    return Array.from(nomes)
  }, [cotacaoSelecionada])

  useEffect(() => {
    if (nomesFornecedorNaCotacao.length !== 1) return
    const encontrado = fornecedores.find((f) => f.nome.trim().toLowerCase() === nomesFornecedorNaCotacao[0].toLowerCase())
    if (encontrado) setFornecedorId(encontrado.id)
  }, [nomesFornecedorNaCotacao, fornecedores])

  const ctx: ContextoFrete = useMemo(() => {
    if (!cotacaoSelecionada) return contextoVazio
    const fornecedor = fornecedores.find((f) => f.id === fornecedorId) ?? null
    const empresa = empresas.find((e) => e.id === cotacaoSelecionada.empresaId) ?? null
    const pesoTotal = cotacaoSelecionada.items.reduce((s, it) => s + (it.product.peso || 0) * (it.product.qtd || 0), 0)
    const descricao = Array.from(new Set(cotacaoSelecionada.items.map((it) => it.product.descricao).filter(Boolean))).join(
      '; ',
    )
    return {
      temCotacao: true,
      fornecedor,
      empresa,
      pesoTotal,
      valorNF: cotacaoSelecionada.summary.precoVendaTotalGeral,
      qtdVolumes: cotacaoSelecionada.items.length,
      descricao,
    }
  }, [cotacaoSelecionada, fornecedores, fornecedorId, empresas])

  async function handleChangeEmpresa(transportadora: string, empresaId: string) {
    setEmpresaPorTransportadoraState((prev) => ({ ...prev, [transportadora]: empresaId }))
    try {
      await setEmpresaPorTransportadora(transportadora, empresaId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    }
  }

  const cotacaoOptions = [
    { value: '', label: '— selecione uma cotação —' },
    ...quotes.map((q) => ({ value: q.id, label: `${q.codigo || 'sem código'} — ${q.cliente || 'sem cliente'}` })),
  ]
  const fornecedorOptions = [
    { value: '', label: '— selecione —' },
    ...fornecedores.map((f) => ({ value: f.id, label: f.nome })),
  ]

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Frete</h2>
        <p className="text-sm text-ink-400">
          Escolha uma cotação e o fornecedor (remetente) pra carregar automaticamente os dados de pedido de frete em
          cada transportadora — CNPJ e CEP do remetente e da empresa destino, peso e valor da nota vêm da cotação.
        </p>
      </div>

      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField label="Cotação" value={cotacaoId} onChange={setCotacaoId} options={cotacaoOptions} />
        <SelectField
          label="Fornecedor (remetente)"
          value={fornecedorId}
          onChange={setFornecedorId}
          options={fornecedorOptions}
          hint={
            nomesFornecedorNaCotacao.length > 1
              ? `Essa cotação tem mais de um fornecedor nos itens (${nomesFornecedorNaCotacao.join(', ')}) — escolha qual usar.`
              : undefined
          }
        />
        {cotacaoSelecionada && !cotacaoSelecionada.empresaId && (
          <p className="sm:col-span-2 text-xs text-amber-700">
            Essa cotação ainda não tem uma empresa (destinatário) definida — defina em Cotações → Dados da cotação
            pra completar o CNPJ/CEP de destino automaticamente.
          </p>
        )}
      </div>

      {loading ? (
        <div className="card text-center text-sm text-ink-400 py-10">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRANSPORTADORAS.map((nome) => (
            <CardTransportadora
              key={nome}
              nome={nome}
              empresas={empresas}
              empresaId={empresaPorTransportadora[nome] ?? ''}
              onChangeEmpresa={(empresaId) => handleChangeEmpresa(nome, empresaId)}
              ctx={ctx}
              aberta={transportadoraAberta === nome}
              onToggle={() => setTransportadoraAberta((prev) => (prev === nome ? null : nome))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
