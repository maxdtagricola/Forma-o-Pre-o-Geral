import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Basics'
import { SelectField } from '../components/ui/Field'
import { getEmpresaPorTransportadora, setEmpresaPorTransportadora } from '../db/configRepo'
import { listEmpresas } from '../db/empresasRepo'
import { listFornecedores } from '../db/fornecedoresRepo'
import {
  cargaDoFornecedor,
  chaveFornecedorFrete,
  freteDoFornecedor,
  listQuotes,
  remetentesDaCotacao,
  salvarCargaFrete,
  salvarFreteTransportadora,
  type RemetenteFrete,
} from '../db/analysesRepo'
import { formatCurrency } from '../utils'
import { formatarNumeroBR, formatarNumeroCurtoBR, parseNumeroFlexivel } from '../numeros'
import { TRANSPORTADORAS } from '../types'
import type { DadosFreteTransportadora, Empresa, Fornecedor, MedidasCargaFrete, QuoteRecord } from '../types'
import { avisar } from '../dialogs'

// ---------------------------------------------------------------------------
// Cada transportadora pede um conjunto diferente de dados pro pedido de frete
// (modelos passados pelo usuário). O que dá pra descobrir sozinho (CNPJ/CEP do
// fornecedor e da empresa destino, peso/valor/volumes da cotação) vem pronto;
// o resto fica em branco pra preencher na hora. Medidas e peso vêm do quadro
// "Medidas da carga" (sempre em cm e kg), informado uma vez só pra todas.
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

/** Campos de medida/peso — preenchidos a partir das "Medidas da carga", já com a unidade. */
type TipoMedida = 'comprimento' | 'largura' | 'altura' | 'medidas' | 'cubagem' | 'peso'

interface CampoFrete {
  chave: string
  label: string
  valorInicial: (ctx: ContextoFrete) => string
  /** Quando presente, o campo vira um <select> com essas opções em vez de texto livre. */
  opcoes?: { value: string; label: string }[]
  medida?: TipoMedida
}

const OPCOES_CIF_FOB = [
  { value: 'CIF', label: 'CIF — remetente paga' },
  { value: 'FOB', label: 'FOB — destinatário paga' },
]
const OPCOES_MODALIDADE_EUCATUR = [
  { value: 'ONIBUS', label: 'Ônibus' },
  { value: 'CAMINHAO', label: 'Caminhão' },
]

const contextoVazio: ContextoFrete = {
  temCotacao: false,
  fornecedor: null,
  empresa: null,
  pesoTotal: 0,
  valorNF: 0,
  qtdVolumes: 0,
  descricao: '',
}

const CARGA_VAZIA: MedidasCargaFrete = { comprimentoCm: 0, larguraCm: 0, alturaCm: 0, pesoKg: 0 }

function enderecoDestino(e: Empresa | null): string {
  if (!e) return ''
  return [e.endereco, e.bairro].filter(Boolean).join(', ')
}
function cidadeUf(municipio?: string, uf?: string): string {
  if (!municipio && !uf) return ''
  return [municipio, uf].filter(Boolean).join(' / ')
}
function cidadeUfOrigem(f: Fornecedor | null): string {
  if (!f) return ''
  return cidadeUf(f.cidade, f.estado)
}

const semValor = () => ''

const CAMPOS_POR_TRANSPORTADORA: Record<string, CampoFrete[]> = {
  EUCATUR: [
    {
      chave: 'modalidade',
      label: 'Modalidade de transporte (Ônibus / Caminhão)',
      valorInicial: semValor,
      opcoes: OPCOES_MODALIDADE_EUCATUR,
    },
    { chave: 'cnpjRemetente', label: 'CNPJ/CPF do remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ/CPF do destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    {
      chave: 'pagador',
      label: 'Responsável pelo pagamento (CIF / FOB)',
      valorInicial: semValor,
      opcoes: OPCOES_CIF_FOB,
    },
    { chave: 'cepOrigem', label: 'CEP de origem', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'cidadeOrigem', label: 'Cidade/UF de origem', valorInicial: (c) => cidadeUfOrigem(c.fornecedor) },
    { chave: 'cepDestino', label: 'CEP de destino', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'cidadeDestino', label: 'Cidade/UF de destino', valorInicial: (c) => cidadeUf(c.empresa?.municipio, c.empresa?.uf) },
    { chave: 'valorNF', label: 'Valor da Nota Fiscal (NFe)', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'volumes', label: 'Quantidade de volumes', valorInicial: (c) => String(c.qtdVolumes || '') },
    { chave: 'pesoBruto', label: 'Peso bruto (kg)', valorInicial: semValor, medida: 'peso' },
    { chave: 'comprimento', label: 'Medida — comprimento (cm)', valorInicial: semValor, medida: 'comprimento' },
    { chave: 'largura', label: 'Medida — largura (cm)', valorInicial: semValor, medida: 'largura' },
    { chave: 'altura', label: 'Medida — altura (cm)', valorInicial: semValor, medida: 'altura' },
    { chave: 'descricaoProduto', label: 'Descrição do produto', valorInicial: (c) => c.descricao },
  ],
  VAPTLOG: [
    { chave: 'cepOrigem', label: 'CEP de origem', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'cidadeOrigem', label: 'Cidade origem', valorInicial: (c) => cidadeUfOrigem(c.fornecedor) },
    { chave: 'cepDestino', label: 'CEP de destino', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'destino', label: 'Destino', valorInicial: (c) => cidadeUf(c.empresa?.municipio, c.empresa?.uf) },
    { chave: 'peso', label: 'Peso (kg)', valorInicial: semValor, medida: 'peso' },
    { chave: 'alturaTotal', label: 'Medidas — altura total (cm)', valorInicial: semValor, medida: 'altura' },
    { chave: 'comprimento', label: 'Medidas — comprimento (cm)', valorInicial: semValor, medida: 'comprimento' },
    { chave: 'largura', label: 'Medidas — largura (cm)', valorInicial: semValor, medida: 'largura' },
    { chave: 'valorNota', label: 'Valor da nota', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'cnpjRemetente', label: 'CNPJ remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'pagador', label: 'Pagador do frete', valorInicial: semValor, opcoes: OPCOES_CIF_FOB },
    { chave: 'email', label: 'E-mail', valorInicial: (c) => c.empresa?.email ?? '' },
  ],
  CARVALIMA: [
    { chave: 'cnpjPagador', label: 'CNPJ do pagador do frete', valorInicial: semValor },
    { chave: 'cnpjRemetente', label: 'CNPJ do remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ do destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'cepOrigem', label: 'CEP de origem', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'cidadeOrigem', label: 'Cidade/UF de origem', valorInicial: (c) => cidadeUfOrigem(c.fornecedor) },
    { chave: 'cepDestino', label: 'CEP de destino', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'cidadeDestino', label: 'Cidade/UF de destino', valorInicial: (c) => cidadeUf(c.empresa?.municipio, c.empresa?.uf) },
    { chave: 'tipoMaterial', label: 'Tipo de material', valorInicial: semValor },
    { chave: 'tipoEmbalagem', label: 'Tipo de embalagem', valorInicial: semValor },
    { chave: 'valorNF', label: 'Valor da nota fiscal', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'volumes', label: 'Quantidade de volumes', valorInicial: (c) => String(c.qtdVolumes || '') },
    { chave: 'pesoTotal', label: 'Peso total dos volumes (kg)', valorInicial: semValor, medida: 'peso' },
    { chave: 'cubagem', label: 'Cubagem (altura, largura, comprimento — cm)', valorInicial: semValor, medida: 'cubagem' },
  ],
  RODONAVES: [
    { chave: 'cepOrigem', label: 'CEP (origem)', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'cidadeOrigem', label: 'Cidade origem', valorInicial: (c) => cidadeUfOrigem(c.fornecedor) },
    { chave: 'cepDestino', label: 'CEP (destino)', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'cidadeUfDestino', label: 'Cidade/UF (destino)', valorInicial: (c) => cidadeUf(c.empresa?.municipio, c.empresa?.uf) },
    { chave: 'enderecoDestino', label: 'Destino da entrega — endereço', valorInicial: (c) => enderecoDestino(c.empresa) },
    { chave: 'bairroDestino', label: 'Bairro', valorInicial: (c) => c.empresa?.bairro ?? '' },
    { chave: 'peso', label: 'Peso (kg)', valorInicial: semValor, medida: 'peso' },
    { chave: 'volumes', label: 'Volumes', valorInicial: (c) => String(c.qtdVolumes || '') },
    { chave: 'valorTotalNF', label: 'Valor total NF', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'medidas', label: 'Medidas (comprimento x largura x altura — cm)', valorInicial: semValor, medida: 'medidas' },
    { chave: 'cnpjRemetente', label: 'CNPJ remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'pagador', label: 'Pagador do frete', valorInicial: semValor, opcoes: OPCOES_CIF_FOB },
    { chave: 'email', label: 'E-mail', valorInicial: (c) => c.empresa?.email ?? '' },
  ],
  // modelo da Granexpress ainda não recebido — usa os campos comuns às outras por enquanto
  GRANEXPRESS: [
    { chave: 'cnpjRemetente', label: 'CNPJ remetente', valorInicial: (c) => c.fornecedor?.cnpj ?? '' },
    { chave: 'cnpjDestinatario', label: 'CNPJ destinatário', valorInicial: (c) => c.empresa?.cnpj ?? '' },
    { chave: 'cepOrigem', label: 'CEP de origem', valorInicial: (c) => c.fornecedor?.cep ?? '' },
    { chave: 'cidadeOrigem', label: 'Cidade/UF de origem', valorInicial: (c) => cidadeUfOrigem(c.fornecedor) },
    { chave: 'cepDestino', label: 'CEP de destino', valorInicial: (c) => c.empresa?.cep ?? '' },
    { chave: 'cidadeDestino', label: 'Cidade/UF de destino', valorInicial: (c) => cidadeUf(c.empresa?.municipio, c.empresa?.uf) },
    { chave: 'valorNF', label: 'Valor da nota fiscal', valorInicial: (c) => (c.temCotacao ? formatCurrency(c.valorNF) : '') },
    { chave: 'volumes', label: 'Quantidade de volumes', valorInicial: (c) => String(c.qtdVolumes || '') },
    { chave: 'peso', label: 'Peso (kg)', valorInicial: semValor, medida: 'peso' },
    { chave: 'medidas', label: 'Medidas (comprimento x largura x altura — cm)', valorInicial: semValor, medida: 'medidas' },
    { chave: 'pagador', label: 'Pagador do frete', valorInicial: semValor, opcoes: OPCOES_CIF_FOB },
  ],
}

const SEM_CAMPOS: CampoFrete[] = []

function cm(valor: number): string {
  return `${formatarNumeroCurtoBR(valor)} cm`
}

/** Texto de um campo de medida/peso a partir das medidas da carga — sempre com a unidade (cm/kg),
 * vazio enquanto a medida não foi informada. */
function textoDaMedida(medida: TipoMedida, carga: MedidasCargaFrete): string {
  const { comprimentoCm: c, larguraCm: l, alturaCm: a, pesoKg } = carga
  switch (medida) {
    case 'peso':
      return pesoKg > 0 ? `${formatarNumeroBR(pesoKg, 2)} kg` : ''
    case 'comprimento':
      return c > 0 ? cm(c) : ''
    case 'largura':
      return l > 0 ? cm(l) : ''
    case 'altura':
      return a > 0 ? cm(a) : ''
    case 'medidas':
      return c > 0 && l > 0 && a > 0
        ? `${formatarNumeroCurtoBR(c)} x ${formatarNumeroCurtoBR(l)} x ${formatarNumeroCurtoBR(a)} cm`
        : ''
    case 'cubagem': {
      if (!(c > 0 && l > 0 && a > 0)) return ''
      const metrosCubicos = (a * l * c) / 1_000_000
      return `${formatarNumeroCurtoBR(a)} x ${formatarNumeroCurtoBR(l)} x ${formatarNumeroCurtoBR(c)} cm (${formatarNumeroBR(metrosCubicos, 3)} m³)`
    }
  }
}

/** Quando a medida é digitada direto no campo da transportadora, completa a unidade sozinho:
 * "50" → "50 cm", "12,5" → "12,50 kg", "50x30x20" → "50 x 30 x 20 cm". Texto que já tem unidade
 * (ou não é número) fica como está. */
function completarUnidade(medida: TipoMedida, texto: string): string {
  const limpo = texto.trim()
  if (!limpo) return ''
  if (medida === 'peso') {
    const n = parseNumeroFlexivel(limpo)
    return n !== undefined ? `${formatarNumeroBR(n, 2)} kg` : limpo
  }
  if (medida === 'comprimento' || medida === 'largura' || medida === 'altura') {
    const n = parseNumeroFlexivel(limpo)
    return n !== undefined ? cm(n) : limpo
  }
  const partes = limpo.split(/\s*[xX×*]\s*/)
  const numeros = partes.map((p) => parseNumeroFlexivel(p))
  if (partes.length === 3 && numeros.every((n) => n !== undefined)) {
    const [p1, p2, p3] = numeros as number[]
    if (medida === 'cubagem') {
      const metrosCubicos = (p1 * p2 * p3) / 1_000_000
      return `${formatarNumeroCurtoBR(p1)} x ${formatarNumeroCurtoBR(p2)} x ${formatarNumeroCurtoBR(p3)} cm (${formatarNumeroBR(metrosCubicos, 3)} m³)`
    }
    return `${formatarNumeroCurtoBR(p1)} x ${formatarNumeroCurtoBR(p2)} x ${formatarNumeroCurtoBR(p3)} cm`
  }
  return limpo
}

/** Valor da cotação de frete como o usuário digitou, sem "R$" repetido (o card já mostra o R$). */
function limparValorCotacao(texto: string): string {
  return texto.replace(/R\$/gi, '').trim()
}

function FormularioFrete({
  transportadora,
  chaveContexto,
  ctx,
  carga,
  dadosSalvos,
  podeSalvar,
  motivoNaoPodeSalvar,
  onSalvar,
}: {
  transportadora: string
  /** Muda só ao trocar de cotação/fornecedor — é o que recarrega o formulário do zero. */
  chaveContexto: string
  ctx: ContextoFrete
  carga: MedidasCargaFrete
  dadosSalvos?: DadosFreteTransportadora
  podeSalvar: boolean
  motivoNaoPodeSalvar: string
  onSalvar: (dados: DadosFreteTransportadora) => Promise<boolean>
}) {
  const campos = CAMPOS_POR_TRANSPORTADORA[transportadora] ?? SEM_CAMPOS
  const [valores, setValores] = useState<Record<string, string>>({})
  const [valorCotacao, setValorCotacao] = useState('')
  const [numeroCotacao, setNumeroCotacao] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)

  // o que cada campo "seria" sozinho, a partir da cotação/fornecedor/empresa e das medidas da carga
  const derivados = useMemo(() => {
    const resultado: Record<string, string> = {}
    for (const campo of campos) {
      resultado[campo.chave] = campo.medida ? textoDaMedida(campo.medida, carga) : campo.valorInicial(ctx)
    }
    return resultado
  }, [campos, ctx, carga])
  const derivadosAnteriores = useRef<Record<string, string>>({})

  // recarrega do zero só ao trocar de transportadora/cotação/fornecedor — e não a cada vez que a
  // lista de cotações é recarregada (isso acontecia ao salvar: o formulário era refeito e o aviso
  // "Salvo!" sumia antes de aparecer, dando a impressão de que nada tinha sido gravado)
  useEffect(() => {
    const iniciais: Record<string, string> = {}
    for (const campo of campos) iniciais[campo.chave] = dadosSalvos?.camposPedido[campo.chave] ?? derivados[campo.chave] ?? ''
    setValores(iniciais)
    setValorCotacao(dadosSalvos?.valorCotacao ?? '')
    setNumeroCotacao(dadosSalvos?.numeroCotacao ?? '')
    setCopiado(false)
    setSalvo(false)
    derivadosAnteriores.current = derivados
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportadora, chaveContexto])

  // quando os dados de origem mudam com o formulário aberto (medidas da carga editadas, cadastro
  // de fornecedor/empresa que terminou de carregar…), acompanha a mudança — campos de medida sempre
  // (o quadro "Medidas da carga" é quem manda neles), os outros só se o usuário não tinha mexido
  useEffect(() => {
    const anteriores = derivadosAnteriores.current
    derivadosAnteriores.current = derivados
    setValores((prev) => {
      let mudou = false
      const proximo = { ...prev }
      for (const campo of campos) {
        const novo = derivados[campo.chave] ?? ''
        const antigo = anteriores[campo.chave] ?? ''
        if (novo === antigo) continue
        const atual = prev[campo.chave] ?? ''
        if (campo.medida || atual === antigo || atual === '') {
          proximo[campo.chave] = novo
          mudou = true
        }
      }
      return mudou ? proximo : prev
    })
  }, [campos, derivados])

  async function handleCopiar() {
    const texto = campos.map((c) => `${c.label}: ${valores[c.chave] ?? ''}`).join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      void avisar('Não foi possível copiar automaticamente — selecione e copie manualmente.')
    }
  }

  async function handleSalvar() {
    if (!podeSalvar) {
      void avisar(motivoNaoPodeSalvar)
      return
    }
    setSalvando(true)
    try {
      const valorLimpo = limparValorCotacao(valorCotacao)
      setValorCotacao(valorLimpo)
      const ok = await onSalvar({ camposPedido: valores, valorCotacao: valorLimpo, numeroCotacao: numeroCotacao.trim() })
      if (ok) {
        setSalvo(true)
        setTimeout(() => setSalvo(false), 2500)
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-ink-200 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campos.map((campo) =>
          campo.opcoes ? (
            <label key={campo.chave}>
              <span className="field-label">{campo.label}</span>
              <select
                className="field-input"
                value={valores[campo.chave] ?? ''}
                onChange={(e) => setValores((prev) => ({ ...prev, [campo.chave]: e.target.value }))}
              >
                <option value="">— selecione —</option>
                {campo.opcoes.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label key={campo.chave}>
              <span className="field-label">{campo.label}</span>
              <input
                type="text"
                className="field-input"
                value={valores[campo.chave] ?? ''}
                onChange={(e) => setValores((prev) => ({ ...prev, [campo.chave]: e.target.value }))}
                onBlur={
                  campo.medida
                    ? (e) => {
                        const completo = completarUnidade(campo.medida!, e.target.value)
                        setValores((prev) => ({ ...prev, [campo.chave]: completo }))
                      }
                    : undefined
                }
              />
            </label>
          ),
        )}
      </div>

      <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
        <p className="text-xs font-medium text-ink-600 mb-2">Retorno da transportadora</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className="field-label">Valor da cotação (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              className="field-input"
              placeholder="ex.: 350,00"
              value={valorCotacao}
              onChange={(e) => setValorCotacao(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Número da cotação</span>
            <input
              type="text"
              className="field-input"
              value={numeroCotacao}
              onChange={(e) => setNumeroCotacao(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={handleCopiar}>
          Copiar dados
        </Button>
        <Button variant="primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar dados'}
        </Button>
        {copiado && <span className="text-xs text-emerald-600">Copiado!</span>}
        {salvo && <span className="text-xs font-medium text-emerald-600">✓ Salvo!</span>}
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
  chaveContexto,
  carga,
  aberta,
  onToggle,
  dadosSalvos,
  podeSalvar,
  motivoNaoPodeSalvar,
  onSalvar,
}: {
  nome: string
  empresas: Empresa[]
  empresaId: string
  onChangeEmpresa: (empresaId: string) => void
  ctx: ContextoFrete
  chaveContexto: string
  carga: MedidasCargaFrete
  aberta: boolean
  onToggle: () => void
  dadosSalvos?: DadosFreteTransportadora
  podeSalvar: boolean
  motivoNaoPodeSalvar: string
  onSalvar: (dados: DadosFreteTransportadora) => Promise<boolean>
}) {
  const empresa = empresas.find((e) => e.id === empresaId)
  const empresaOptions = [{ value: '', label: '— selecione —' }, ...empresas.map((e) => ({ value: e.id, label: e.nome }))]

  // a "empresa destino padrão" da transportadora entra quando a cotação não definiu uma empresa
  // (destinatário) — antes o aviso dizia isso, mas o formulário nunca usava
  const ctxDoCard = useMemo(
    () => (ctx.empresa || !empresa ? ctx : { ...ctx, empresa }),
    [ctx, empresa],
  )

  const valorSalvo = dadosSalvos?.valorCotacao ? parseNumeroFlexivel(dadosSalvos.valorCotacao) : undefined

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
      {!aberta && (dadosSalvos?.valorCotacao || dadosSalvos?.numeroCotacao) && (
        <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-2.5 text-xs text-ink-700">
          {dadosSalvos.valorCotacao && (
            <p>
              Cotação:{' '}
              <span className="font-mono font-medium">
                {valorSalvo !== undefined ? formatCurrency(valorSalvo) : `R$ ${dadosSalvos.valorCotacao}`}
              </span>
            </p>
          )}
          {dadosSalvos.numeroCotacao && (
            <p>
              Nº <span className="font-mono font-medium">{dadosSalvos.numeroCotacao}</span>
            </p>
          )}
        </div>
      )}
      <button type="button" onClick={onToggle} className="mt-3 text-xs font-medium text-ink-600 underline hover:text-ink-900">
        {aberta ? 'Ocultar dados de pedido de frete' : 'Gerar dados de pedido de frete'}
      </button>
      {aberta && (
        <FormularioFrete
          transportadora={nome}
          chaveContexto={chaveContexto}
          ctx={ctxDoCard}
          carga={carga}
          dadosSalvos={dadosSalvos}
          podeSalvar={podeSalvar}
          motivoNaoPodeSalvar={motivoNaoPodeSalvar}
          onSalvar={onSalvar}
        />
      )}
    </div>
  )
}

/** Campo numérico do quadro "Medidas da carga" — aceita vírgula ou ponto, mostra a unidade ao lado. */
function CampoMedida({
  label,
  unidade,
  valor,
  onChange,
  onBlur,
  dica,
}: {
  label: string
  unidade: string
  valor: number
  onChange: (valor: number) => void
  onBlur: () => void
  dica?: string
}) {
  const [texto, setTexto] = useState(valor > 0 ? formatarNumeroCurtoBR(valor, 3) : '')
  const focado = useRef(false)

  // acompanha mudanças vindas de fora (trocar de cotação/fornecedor) sem atrapalhar a digitação
  useEffect(() => {
    if (!focado.current) setTexto(valor > 0 ? formatarNumeroCurtoBR(valor, 3) : '')
  }, [valor])

  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          className="field-input pr-10 text-right tabular-nums"
          value={texto}
          onFocus={() => {
            focado.current = true
          }}
          onChange={(e) => {
            setTexto(e.target.value)
            onChange(parseNumeroFlexivel(e.target.value) ?? 0)
          }}
          onBlur={() => {
            focado.current = false
            setTexto(valor > 0 ? formatarNumeroCurtoBR(valor, 3) : '')
            onBlur()
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-400">
          {unidade}
        </span>
      </div>
      {dica && <span className="mt-1 block text-[11px] text-ink-400">{dica}</span>}
    </label>
  )
}

/** Valor do <select> de fornecedor: "grupo:<chave>" — um fornecedor + UF que está nos itens da
 * cotação (com ou sem cadastro; é a origem de onde a mercadoria sai) — ou "id:<id do cadastro>",
 * outro fornecedor cadastrado que (ainda) não aparece nos itens. */
type SelecaoFornecedor = string

function rotuloComUf(r: RemetenteFrete): string {
  return r.uf ? `${r.nome} — ${r.uf}` : r.nome
}

export function FretePage({ cotacaoIdInicial }: { cotacaoIdInicial?: string }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [empresaPorTransportadora, setEmpresaPorTransportadoraState] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  // chega pré-selecionada quando vem do botão "Ir para Frete" da Precificação — assim o usuário
  // não precisa procurar a cotação de novo numa lista
  const [cotacaoId, setCotacaoId] = useState(cotacaoIdInicial ?? '')
  const [selecaoFornecedor, setSelecaoFornecedor] = useState<SelecaoFornecedor>('')
  const [transportadoraAberta, setTransportadoraAberta] = useState<string | null>(null)
  const [perguntandoFornecedor, setPerguntandoFornecedor] = useState(false)
  const [carga, setCarga] = useState<MedidasCargaFrete>(CARGA_VAZIA)
  const [cargaSalva, setCargaSalva] = useState(false)
  const cargaGravada = useRef<string>('')

  useEffect(() => {
    Promise.all([listEmpresas(), listFornecedores(), listQuotes(), getEmpresaPorTransportadora()])
      .then(([listaEmpresas, listaFornecedores, listaQuotes, mapa]) => {
        setEmpresas(listaEmpresas)
        setFornecedores(listaFornecedores)
        setQuotes(listaQuotes)
        setEmpresaPorTransportadoraState(mapa)
      })
      .catch((err) => void avisar(err instanceof Error ? err.message : 'Erro ao carregar dados do servidor.'))
      .finally(() => setLoading(false))
  }, [])

  const cotacaoSelecionada = useMemo(() => quotes.find((q) => q.id === cotacaoId), [quotes, cotacaoId])

  // fornecedores (+ UF de origem) distintos usados nos itens da cotação — o mesmo fornecedor em dois
  // estados aparece duas vezes: são duas origens, cada uma com o seu frete
  const remetentesNaCotacao = useMemo(
    () => (cotacaoSelecionada ? remetentesDaCotacao(cotacaoSelecionada) : []),
    [cotacaoSelecionada],
  )

  /** Cadastro do fornecedor de um grupo dos itens: o de mesmo nome e mesmo estado, ou, não havendo,
   * o de mesmo nome. */
  function cadastroDoRemetente(r: RemetenteFrete): Fornecedor | null {
    const doNome = fornecedores.filter((f) => chaveFornecedorFrete(f.nome) === chaveFornecedorFrete(r.nome))
    return doNome.find((f) => (f.estado || '').toUpperCase() === (r.uf || '').toUpperCase()) ?? doNome[0] ?? null
  }

  // trocar de cotação zera o fornecedor escolhido (era de outra cotação) — e, com um fornecedor só
  // nos itens, já escolhe ele sozinho
  useEffect(() => {
    if (remetentesNaCotacao.length === 1) setSelecaoFornecedor(`grupo:${remetentesNaCotacao[0].chave}`)
    else setSelecaoFornecedor('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotacaoId, remetentesNaCotacao.map((r) => r.chave).join('|')])

  // ao chegar direto de uma cotação (botão "Ir para Frete" da Precificação) com mais de um
  // fornecedor nos itens, pergunta qual é antes de mostrar o resto da página — sem isso os dados
  // de peso/valor/descrição do pedido de frete juntariam itens de fornecedores diferentes
  const jaPerguntouPara = useRef('')
  useEffect(() => {
    // pergunta uma vez só por cotação — "Escolher depois" não pode fazer a janela voltar sozinha
    if (
      cotacaoIdInicial &&
      cotacaoId === cotacaoIdInicial &&
      remetentesNaCotacao.length > 1 &&
      !selecaoFornecedor &&
      jaPerguntouPara.current !== cotacaoId
    ) {
      jaPerguntouPara.current = cotacaoId
      setPerguntandoFornecedor(true)
    }
    // escolheu o fornecedor de outro jeito (pela lista da página): a pergunta não precisa mais ficar aberta
    if (selecaoFornecedor) setPerguntandoFornecedor(false)
  }, [cotacaoIdInicial, cotacaoId, remetentesNaCotacao, selecaoFornecedor])

  /** Fornecedor (+ UF) dono do frete — o nome como está nos itens e o estado de onde despacha; é a
   * chave em que o frete e as medidas ficam salvos. */
  const remetenteSelecionado = useMemo((): RemetenteFrete | null => {
    if (selecaoFornecedor.startsWith('grupo:')) {
      return remetentesNaCotacao.find((r) => r.chave === selecaoFornecedor.slice(6)) ?? null
    }
    if (selecaoFornecedor.startsWith('id:')) {
      const f = fornecedores.find((x) => x.id === selecaoFornecedor.slice(3))
      return f ? { nome: f.nome, uf: f.estado || undefined } : null
    }
    return null
  }, [selecaoFornecedor, remetentesNaCotacao, fornecedores])

  const fornecedorCadastro = useMemo(() => {
    if (selecaoFornecedor.startsWith('id:')) return fornecedores.find((f) => f.id === selecaoFornecedor.slice(3)) ?? null
    return remetenteSelecionado ? cadastroDoRemetente(remetenteSelecionado) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecaoFornecedor, fornecedores, remetenteSelecionado])

  // sem fornecedor escolhido (itens ainda sem fornecedor): o frete fica no conjunto geral da cotação
  const remetenteFrete: RemetenteFrete = remetenteSelecionado ?? { nome: '' }
  const chaveRemetente = chaveFornecedorFrete(remetenteFrete.nome, remetenteFrete.uf)

  function handleEscolherFornecedorDaPergunta(r: RemetenteFrete & { chave: string }) {
    setSelecaoFornecedor(`grupo:${r.chave}`)
    setPerguntandoFornecedor(false)
  }

  const ctx: ContextoFrete = useMemo(() => {
    if (!cotacaoSelecionada) return contextoVazio
    const empresa = empresas.find((e) => e.id === cotacaoSelecionada.empresaId) ?? null
    // só entram no pedido de frete os itens do fornecedor (+ UF) selecionado — cotação com mais de
    // uma origem não pode juntar tudo num pedido só, já que cada uma despacha de um lugar diferente.
    // Sem fornecedor selecionado: usa todos os itens só se só existir uma origem na cotação (caso
    // comum, nada a escolher); havendo mais de uma, fica sem itens até alguém escolher.
    const itensDoFornecedor = remetenteSelecionado
      ? cotacaoSelecionada.items.filter(
          (it) => chaveFornecedorFrete(it.product.fornecedor, it.product.estadoOrigem) === chaveRemetente,
        )
      : remetentesNaCotacao.length <= 1
        ? cotacaoSelecionada.items
        : []
    const pesoTotal = itensDoFornecedor.reduce((s, it) => s + (it.product.peso || 0) * (it.product.qtd || 0), 0)
    // valor da nota fiscal pro pedido de frete é o valor dos produtos (quantidade × valor unitário
    // de compra — o que o fornecedor cobra, igual à Nota Fiscal dele) e não o preço de venda ao
    // cliente: são grandezas diferentes, uma é custo de mercadoria, a outra já inclui a margem
    const valorNF = itensDoFornecedor.reduce((s, it) => s + (it.product.qtd || 0) * (it.product.valorUnt || 0), 0)
    const descricao = Array.from(new Set(itensDoFornecedor.map((it) => it.product.descricao).filter(Boolean))).join('; ')
    return {
      temCotacao: true,
      fornecedor: fornecedorCadastro,
      empresa,
      pesoTotal,
      valorNF,
      qtdVolumes: itensDoFornecedor.length,
      descricao,
    }
  }, [cotacaoSelecionada, fornecedorCadastro, empresas, remetenteSelecionado, chaveRemetente, remetentesNaCotacao])

  const chaveContexto = `${cotacaoId}|${chaveRemetente}`

  // medidas da carga: as salvas pra esse fornecedor da cotação ou, sem nada salvo ainda, começa
  // pelo peso somado dos itens (peso × quantidade, em kg) — só as dimensões ficam pra preencher
  useEffect(() => {
    if (!cotacaoSelecionada) {
      setCarga(CARGA_VAZIA)
      cargaGravada.current = ''
      return
    }
    const salva = cargaDoFornecedor(cotacaoSelecionada, remetenteFrete)
    const inicial = salva ?? { ...CARGA_VAZIA, pesoKg: Math.round(ctx.pesoTotal * 1000) / 1000 }
    setCarga(inicial)
    cargaGravada.current = salva ? JSON.stringify(salva) : ''
    setCargaSalva(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveContexto, ctx.pesoTotal, cotacaoSelecionada?.id])

  const fornecedorDefinido = remetentesNaCotacao.length <= 1 || !!remetenteSelecionado
  const podeSalvar = !!cotacaoSelecionada && fornecedorDefinido
  const motivoNaoPodeSalvar = !cotacaoSelecionada
    ? 'Escolha uma cotação antes de salvar os dados de frete.'
    : 'Essa cotação tem mais de um fornecedor (ou o mesmo fornecedor em estados diferentes) — escolha de qual é esse frete antes de salvar.'

  async function handleSalvarCarga() {
    if (!cotacaoSelecionada || !fornecedorDefinido) return
    const serializada = JSON.stringify(carga)
    if (serializada === cargaGravada.current) return
    try {
      const atualizado = await salvarCargaFrete(cotacaoSelecionada.id, remetenteFrete, carga)
      cargaGravada.current = serializada
      setQuotes((prev) => prev.map((q) => (q.id === atualizado.id ? atualizado : q)))
      setCargaSalva(true)
      setTimeout(() => setCargaSalva(false), 2500)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar as medidas no servidor.')
    }
  }

  async function handleChangeEmpresa(transportadora: string, empresaId: string) {
    setEmpresaPorTransportadoraState((prev) => ({ ...prev, [transportadora]: empresaId }))
    try {
      await setEmpresaPorTransportadora(transportadora, empresaId)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    }
  }

  async function handleSalvarFreteTransportadora(transportadora: string, dados: DadosFreteTransportadora): Promise<boolean> {
    if (!cotacaoSelecionada) return false
    try {
      const atualizado = await salvarFreteTransportadora(cotacaoSelecionada.id, remetenteFrete, transportadora, dados)
      setQuotes((prev) => prev.map((q) => (q.id === atualizado.id ? atualizado : q)))
      // as medidas da carga vão junto — quem preencheu as medidas e já salvou a transportadora não
      // precisa lembrar de sair do campo pra elas ficarem gravadas
      await handleSalvarCarga()
      return true
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
      return false
    }
  }

  const freteSalvo = useMemo(
    () => (cotacaoSelecionada ? freteDoFornecedor(cotacaoSelecionada, remetenteFrete) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cotacaoSelecionada, chaveRemetente],
  )

  const cotacaoOptions = [
    { value: '', label: '— selecione uma cotação —' },
    ...quotes.map((q) => ({ value: q.id, label: `${q.codigo || 'sem código'} — ${q.cliente || 'sem cliente'}` })),
  ]
  const fornecedorOptions = useMemo(() => {
    const opcoes: { value: string; label: string }[] = [{ value: '', label: '— selecione —' }]
    // primeiro os fornecedores (+ UF) que estão nos itens dessa cotação, inclusive os sem cadastro
    const chavesNaCotacao = new Set(remetentesNaCotacao.map((r) => r.chave))
    for (const r of remetentesNaCotacao) {
      opcoes.push({
        value: `grupo:${r.chave}`,
        label: `${rotuloComUf(r)}${cadastroDoRemetente(r) ? '' : ' (sem cadastro)'}`,
      })
    }
    for (const f of fornecedores) {
      if (chavesNaCotacao.has(chaveFornecedorFrete(f.nome, f.estado))) continue
      opcoes.push({ value: `id:${f.id}`, label: f.estado ? `${f.nome} — ${f.estado}` : f.nome })
    }
    return opcoes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remetentesNaCotacao, fornecedores])

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Frete</h2>
        <p className="text-sm text-ink-400">
          Escolha uma cotação e o fornecedor (remetente) pra carregar automaticamente os dados de pedido de frete em
          cada transportadora — CNPJ e CEP do remetente e da empresa destino, peso e valor da nota vêm da cotação.
          Com mais de um fornecedor na cotação, cada um tem o seu próprio frete salvo.
        </p>
      </div>

      <div className="card grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField label="Cotação" value={cotacaoId} onChange={setCotacaoId} options={cotacaoOptions} />
        <SelectField
          label="Fornecedor (remetente)"
          value={selecaoFornecedor}
          onChange={setSelecaoFornecedor}
          options={fornecedorOptions}
          hint={
            remetentesNaCotacao.length > 1
              ? `Essa cotação tem itens de mais de uma origem (${remetentesNaCotacao.map(rotuloComUf).join(', ')}) — escolha qual usar; o frete de cada fornecedor/estado fica salvo separado.`
              : undefined
          }
        />
        {cotacaoSelecionada && !cotacaoSelecionada.empresaId && (
          <p className="sm:col-span-2 text-xs text-amber-700">
            Essa cotação ainda não tem uma empresa (destinatário) definida — defina em Cotações → Dados da cotação
            pra completar o CNPJ/CEP de destino automaticamente (até lá, vale a empresa destino padrão de cada
            transportadora).
          </p>
        )}
      </div>

      {cotacaoSelecionada && (
        <div className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <h3 className="font-display text-base font-semibold text-ink-900">
              Medidas da carga{remetenteSelecionado ? ` — ${rotuloComUf(remetenteSelecionado)}` : ''}
            </h3>
            {cargaSalva && <span className="text-xs font-medium text-emerald-600">✓ Medidas salvas</span>}
          </div>
          <p className="text-xs text-ink-400 mb-4">
            Informe uma vez, em centímetros e quilos — as medidas e o peso entram sozinhos (já com cm/kg) no pedido de
            frete de todas as transportadoras abaixo. O peso começa com a soma dos itens (peso × quantidade).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <CampoMedida
              label="Comprimento"
              unidade="cm"
              valor={carga.comprimentoCm}
              onChange={(v) => setCarga((c) => ({ ...c, comprimentoCm: v }))}
              onBlur={handleSalvarCarga}
            />
            <CampoMedida
              label="Largura"
              unidade="cm"
              valor={carga.larguraCm}
              onChange={(v) => setCarga((c) => ({ ...c, larguraCm: v }))}
              onBlur={handleSalvarCarga}
            />
            <CampoMedida
              label="Altura"
              unidade="cm"
              valor={carga.alturaCm}
              onChange={(v) => setCarga((c) => ({ ...c, alturaCm: v }))}
              onBlur={handleSalvarCarga}
            />
            <CampoMedida
              label="Peso"
              unidade="kg"
              valor={carga.pesoKg}
              onChange={(v) => setCarga((c) => ({ ...c, pesoKg: v }))}
              onBlur={handleSalvarCarga}
              dica={ctx.pesoTotal > 0 ? `Soma dos itens: ${formatarNumeroBR(ctx.pesoTotal, 2)} kg` : 'Itens sem peso cadastrado'}
            />
          </div>
          {!fornecedorDefinido && (
            <p className="mt-3 text-xs text-amber-700">Escolha o fornecedor acima pra salvar as medidas dele.</p>
          )}
        </div>
      )}

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
              chaveContexto={chaveContexto}
              carga={carga}
              aberta={transportadoraAberta === nome}
              onToggle={() => setTransportadoraAberta((prev) => (prev === nome ? null : nome))}
              dadosSalvos={freteSalvo[nome]}
              podeSalvar={podeSalvar}
              motivoNaoPodeSalvar={motivoNaoPodeSalvar}
              onSalvar={(dados) => handleSalvarFreteTransportadora(nome, dados)}
            />
          ))}
        </div>
      )}

      {perguntandoFornecedor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPerguntandoFornecedor(false)}>
          <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">De qual fornecedor é esse frete?</h3>
            <p className="text-sm text-ink-400 mb-4">
              Essa cotação tem itens de mais de um fornecedor (ou do mesmo fornecedor saindo de estados diferentes) —
              escolha um pra não juntar tudo num pedido de frete só.
            </p>
            <div className="flex flex-col gap-2">
              {remetentesNaCotacao.map((r) => (
                <button
                  key={r.chave}
                  type="button"
                  onClick={() => handleEscolherFornecedorDaPergunta(r)}
                  className="rounded-lg border border-ink-200 px-4 py-2.5 text-left text-sm font-medium text-ink-700 hover:border-ink-400 hover:bg-ink-50 transition"
                >
                  {rotuloComUf(r)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPerguntandoFornecedor(false)}
                className="mt-1 text-xs font-medium text-ink-400 hover:text-ink-700"
              >
                Escolher depois
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
