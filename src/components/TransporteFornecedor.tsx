import { useState } from 'react'
import { Button } from './ui/Basics'
import { diasUteisAte, textoDiasUteis } from '../diasUteis'
import type { DadosTransporte, QuoteRecord } from '../types'

// -----------------------------------------------------------------------
// Dados do envio de cada fornecedor do pedido (NF, cotação do frete,
// transportadora, link de rastreio) — pedidos ao passar pra EM TRANSPORTE
// na aba Pedido de Compra e editáveis depois no cartão de cada fornecedor.
// -----------------------------------------------------------------------

export type DadosTransporteEditaveis = Omit<DadosTransporte, 'atualizadoEm' | 'atualizadoPor' | 'previsaoEntrega'> & {
  previsaoEntrega: string
}

export const TRANSPORTE_VAZIO: DadosTransporteEditaveis = {
  numeroNotaFiscal: '',
  numeroCotacaoFrete: '',
  transportadora: '',
  linkRastreio: '',
  previsaoEntrega: '',
}

/** A previsão de entrega mais cedo entre os fornecedores da cotação ("AAAA-MM-DD"), se alguma foi informada. */
export function previsaoDaCotacao(cotacao: Pick<QuoteRecord, 'transportePorFornecedor'>): string | undefined {
  const datas = Object.values(cotacao.transportePorFornecedor ?? {})
    .map((t) => t.previsaoEntrega ?? '')
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  return datas[0]
}

/** "chega 10/10 · em 3 dias úteis", "chega hoje" ou "atrasada 2 dias úteis (previsão 08/10)". */
export function situacaoDaPrevisao(previsao: string, agora: number = Date.now()): { texto: string; atrasada: boolean } {
  const [ano, mes, dia] = previsao.split('-').map(Number)
  const data = new Date(ano, mes - 1, dia).getTime()
  const dataBR = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
  const dias = diasUteisAte(data, agora)
  if (dias === 0) return { texto: `chega hoje (${dataBR})`, atrasada: false }
  if (dias > 0) return { texto: `chega ${dataBR} · em ${textoDiasUteis(dias)}`, atrasada: false }
  // previsão passou: num fim de semana/feriado logo depois dela a contagem de dias úteis ainda é 0
  return { texto: `atrasada ${textoDiasUteis(Math.max(1, -dias))} (previsão ${dataBR})`, atrasada: true }
}

/** Selo da previsão de entrega (cinza no prazo, vermelho atrasada). */
export function SeloPrevisao({ previsao, agora }: { previsao: string; agora?: number }) {
  const { texto, atrasada } = situacaoDaPrevisao(previsao, agora)
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        atrasada ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-800'
      }`}
      title="Previsão de entrega informada pela transportadora (dias úteis)"
    >
      {texto}
    </span>
  )
}

/** Link de rastreio pronto pra abrir: aceita sem o "https://" (ex.: "rastreio.transportadora.com.br/…").
 * Vazio → '' ; não parece um endereço → undefined (inválido). */
export function normalizarLinkRastreio(texto: string): string | undefined {
  const bruto = texto.trim()
  if (!bruto) return ''
  const comEsquema = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`
  try {
    const url = new URL(comEsquema)
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function CamposTransporte({
  valor,
  onChange,
  idBase,
}: {
  valor: DadosTransporteEditaveis
  onChange: (patch: Partial<DadosTransporteEditaveis>) => void
  idBase: string
}) {
  const linkInvalido = normalizarLinkRastreio(valor.linkRastreio) === undefined
  const campo = (rotulo: string, chave: keyof DadosTransporteEditaveis, extra?: { placeholder?: string; inputMode?: 'numeric' | 'url' }) => (
    <label className="block" htmlFor={`${idBase}-${chave}`}>
      <span className="mb-1 block text-xs font-medium text-ink-600">{rotulo}</span>
      <input
        id={`${idBase}-${chave}`}
        className={`field-input py-1.5 text-sm ${chave === 'linkRastreio' && linkInvalido ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : ''}`}
        value={valor[chave]}
        placeholder={extra?.placeholder}
        inputMode={extra?.inputMode}
        aria-invalid={chave === 'linkRastreio' && linkInvalido}
        onChange={(e) => onChange({ [chave]: e.target.value })}
      />
    </label>
  )
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {campo('Nº da nota fiscal', 'numeroNotaFiscal', { inputMode: 'numeric' })}
      {campo('Nº da cotação do frete', 'numeroCotacaoFrete')}
      {campo('Transportadora', 'transportadora')}
      {campo('Link de rastreio', 'linkRastreio', { placeholder: 'https://… (página de acompanhamento)', inputMode: 'url' })}
      <label className="block" htmlFor={`${idBase}-previsaoEntrega`}>
        <span className="mb-1 block text-xs font-medium text-ink-600">Previsão de entrega (a que a transportadora informa)</span>
        <input
          id={`${idBase}-previsaoEntrega`}
          type="date"
          className="field-input py-1.5 text-sm"
          value={valor.previsaoEntrega}
          onChange={(e) => onChange({ previsaoEntrega: e.target.value })}
        />
      </label>
      {linkInvalido && <p className="text-xs text-rose-600 sm:col-span-2">O link de rastreio não parece um endereço de site — confira (ex.: https://…).</p>}
    </div>
  )
}

/** Botão que abre o rastreio numa aba nova (só aparece com um link válido). */
export function BotaoRastreio({ link, compacto = false }: { link: string; compacto?: boolean }) {
  const url = normalizarLinkRastreio(link)
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 rounded-lg border border-ink-200 font-medium text-ink-700 transition hover:bg-ink-50 ${
        compacto ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
      }`}
    >
      Acompanhar entrega ↗
    </a>
  )
}

/** Janela que abre ao mudar o status pra EM TRANSPORTE: os dados do envio de cada fornecedor. */
export function TransporteModal({
  codigoCotacao,
  grupos,
  onConfirmar,
  onCancelar,
}: {
  codigoCotacao: string
  grupos: { chave: string; rotulo: string; inicial: DadosTransporteEditaveis }[]
  onConfirmar: (dados: Record<string, DadosTransporteEditaveis>) => Promise<void>
  onCancelar: () => void
}) {
  const [dados, setDados] = useState<Record<string, DadosTransporteEditaveis>>(() =>
    Object.fromEntries(grupos.map((g) => [g.chave, g.inicial])),
  )
  const [salvando, setSalvando] = useState(false)
  const algumLinkInvalido = Object.values(dados).some((d) => normalizarLinkRastreio(d.linkRastreio) === undefined)

  async function handleConfirmar() {
    if (algumLinkInvalido) return
    setSalvando(true)
    try {
      await onConfirmar(dados)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold text-ink-900">Em transporte — dados do envio</h3>
        <p className="mb-3 text-sm text-ink-400">
          {codigoCotacao ? `${codigoCotacao} · ` : ''}Informe o que já tiver de cada fornecedor — dá pra completar depois, no cartão
          dele aqui no Pedido de Compra.
        </p>
        <div className="flex-1 space-y-5 overflow-y-auto py-1">
          {grupos.map((g) => (
            <section key={g.chave} aria-label={`Envio de ${g.rotulo}`}>
              <p className="mb-2 text-sm font-semibold text-ink-800">Fornecedor: {g.rotulo}</p>
              <CamposTransporte
                idBase={`transporte-${g.chave}`}
                valor={dados[g.chave]}
                onChange={(patch) => setDados((prev) => ({ ...prev, [g.chave]: { ...prev[g.chave], ...patch } }))}
              />
            </section>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void handleConfirmar()} disabled={salvando || algumLinkInvalido}>
            {salvando ? 'Salvando…' : 'Confirmar: em transporte'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Cartão "Transporte" no fornecedor do pedido — edita e salva os dados do envio dele. */
export function CartaoTransporte({
  chave,
  inicial,
  salvoEm,
  salvoPor,
  onSalvar,
}: {
  chave: string
  inicial: DadosTransporteEditaveis
  salvoEm?: number
  salvoPor?: string
  onSalvar: (dados: DadosTransporteEditaveis) => Promise<void>
}) {
  const [dados, setDados] = useState(inicial)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const alterado = (Object.keys(TRANSPORTE_VAZIO) as (keyof DadosTransporteEditaveis)[]).some((k) => dados[k] !== inicial[k])
  const linkInvalido = normalizarLinkRastreio(dados.linkRastreio) === undefined

  async function handleSalvar() {
    setSalvando(true)
    try {
      await onSalvar(dados)
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2000)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-ink-100 bg-ink-50/50 p-3" aria-label="Transporte">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-800">
          Transporte
          {salvoEm && (
            <span className="ml-2 text-xs font-normal text-ink-400">
              atualizado em {new Date(salvoEm).toLocaleDateString('pt-BR')}
              {salvoPor ? ` por ${salvoPor}` : ''}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {salvo && <span className="text-xs text-emerald-600">Salvo!</span>}
          {inicial.previsaoEntrega && <SeloPrevisao previsao={inicial.previsaoEntrega} />}
          <BotaoRastreio link={inicial.linkRastreio} compacto />
          <Button variant="secondary" onClick={() => void handleSalvar()} disabled={!alterado || salvando || linkInvalido}>
            {salvando ? 'Salvando…' : 'Salvar transporte'}
          </Button>
        </div>
      </div>
      <CamposTransporte idBase={`cartao-${chave}`} valor={dados} onChange={(patch) => setDados((prev) => ({ ...prev, ...patch }))} />
    </div>
  )
}
