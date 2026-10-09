import { useEffect, useState, type ReactNode } from 'react'
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

/** A previsão de entrega mais cedo entre os fornecedores da cotação que ainda não entregaram
 * ("AAAA-MM-DD"), se alguma foi informada. */
export function previsaoDaCotacao(cotacao: Pick<QuoteRecord, 'transportePorFornecedor'>): string | undefined {
  const datas = Object.values(cotacao.transportePorFornecedor ?? {})
    .filter((t) => !t.entregueEm)
    .map((t) => t.previsaoEntrega ?? '')
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  return datas[0]
}

/** Previsão de entrega (da transportadora) ou de finalização da produção (do fornecedor). */
export type TipoPrevisao = 'entrega' | 'producao'

/** "chega 10/10 · em 3 dias úteis" (ou "fica pronto…", na produção), "chega hoje" ou "atrasada 2 dias
 * úteis (previsão 08/10)". `diasUteis`: quantos dias úteis faltam (negativo = atrasada). */
export function situacaoDaPrevisao(
  previsao: string,
  agora: number = Date.now(),
  tipo: TipoPrevisao = 'entrega',
): { texto: string; atrasada: boolean; diasUteis: number } {
  const [ano, mes, dia] = previsao.split('-').map(Number)
  const data = new Date(ano, mes - 1, dia).getTime()
  const dataBR = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
  const dias = diasUteisAte(data, agora)
  const verbo = tipo === 'entrega' ? 'chega' : 'fica pronto'
  if (dias === 0) return { texto: `${verbo} hoje (${dataBR})`, atrasada: false, diasUteis: 0 }
  if (dias > 0) return { texto: `${verbo} ${dataBR} · em ${textoDiasUteis(dias)}`, atrasada: false, diasUteis: dias }
  // previsão passou: num fim de semana/feriado logo depois dela a contagem de dias úteis ainda é 0
  return { texto: `atrasada ${textoDiasUteis(Math.max(1, -dias))} (previsão ${dataBR})`, atrasada: true, diasUteis: Math.min(-1, dias) }
}

/** Selo da previsão (cinza no prazo, vermelho atrasada). */
export function SeloPrevisao({ previsao, agora, tipo = 'entrega' }: { previsao: string; agora?: number; tipo?: TipoPrevisao }) {
  const { texto, atrasada } = situacaoDaPrevisao(previsao, agora, tipo)
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        atrasada ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-800'
      }`}
      title={
        tipo === 'entrega'
          ? 'Previsão de entrega informada pela transportadora (dias úteis)'
          : 'Previsão de finalização da produção informada pelo fornecedor (dias úteis)'
      }
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
        {/* não controlado (ver DateField): controlado, o campo se apagava enquanto o ano era digitado */}
        <input
          id={`${idBase}-previsaoEntrega`}
          type="date"
          className="field-input py-1.5 text-sm"
          defaultValue={valor.previsaoEntrega}
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

/** Janela por cima da tela com o envio de cada fornecedor de um pedido em transporte — NF,
 * transportadora, cotação do frete, rastreio e previsão — pra consultar rápido, sem abrir o pedido.
 * Fecha no "×", no ESC ou clicando fora. */
export function ResumoTransporteModal({
  titulo,
  subtitulo,
  selos,
  fornecedores,
  onAbrirPedido,
  onFechar,
}: {
  titulo: string
  subtitulo?: string
  selos?: ReactNode
  fornecedores: { chave: string; rotulo: string; transporte?: DadosTransporte }[]
  onAbrirPedido: () => void
  onFechar: () => void
}) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const campo = (rotulo: string, valor: string | undefined) => (
    <div>
      <p className="text-xs text-ink-400">{rotulo}</p>
      <p className={`text-sm ${valor ? 'font-medium text-ink-900' : 'text-ink-300'}`}>{valor || '—'}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div role="dialog" aria-modal="true" aria-label={`Transporte — ${titulo}`} className="card relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden">
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          title="Fechar (Esc)"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-ink-400 transition hover:bg-ink-100 hover:text-ink-800"
        >
          ×
        </button>
        <div className="pr-10">
          <h3 className="font-display text-lg font-semibold text-ink-900">{titulo}</h3>
          {subtitulo && <p className="text-sm text-ink-400">{subtitulo}</p>}
          {selos && <div className="mt-2 flex flex-wrap items-center gap-2">{selos}</div>}
        </div>
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
          {fornecedores.map((f) => {
            const t = f.transporte
            return (
              <section key={f.chave} aria-label={`Envio de ${f.rotulo}`} className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-800">Fornecedor: {f.rotulo}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {t?.entregueEm ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        ✓ Entregue em {new Date(t.entregueEm).toLocaleDateString('pt-BR')}
                      </span>
                    ) : (
                      t?.previsaoEntrega && <SeloPrevisao previsao={t.previsaoEntrega} />
                    )}
                    {t?.linkRastreio && <BotaoRastreio link={t.linkRastreio} compacto />}
                  </div>
                </div>
                {t ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {campo('Nota fiscal', t.numeroNotaFiscal)}
                    {campo('Transportadora', t.transportadora)}
                    {campo('Cotação do frete', t.numeroCotacaoFrete)}
                    {campo(
                      'Previsão de entrega',
                      t.previsaoEntrega ? new Date(`${t.previsaoEntrega}T00:00:00`).toLocaleDateString('pt-BR') : undefined,
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-ink-400">Os dados do envio desse fornecedor ainda não foram informados.</p>
                )}
                {t && !normalizarLinkRastreio(t.linkRastreio) && <p className="mt-2 text-xs text-ink-400">Sem link de rastreio.</p>}
              </section>
            )
          })}
        </div>
        <div className="mt-3 flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button variant="secondary" onClick={onAbrirPedido}>
            Abrir o pedido
          </Button>
          <Button variant="primary" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Cartão "Transporte" no fornecedor do pedido — edita e salva os dados do envio dele, e mostra (ou
 * marca) a entrega da mercadoria. */
export function CartaoTransporte({
  chave,
  inicial,
  salvoEm,
  salvoPor,
  entregueEm,
  entreguePor,
  onMarcarEntregue,
  onDesfazerEntrega,
  onSalvar,
}: {
  chave: string
  inicial: DadosTransporteEditaveis
  salvoEm?: number
  salvoPor?: string
  entregueEm?: number
  entreguePor?: string
  /** Sem ele, não aparece o botão de marcar entregue (ex.: pedido de um fornecedor só — o botão é o do topo). */
  onMarcarEntregue?: () => void
  /** Sem ele, a entrega não pode mais ser desfeita aqui (ex.: cotação já conferida). */
  onDesfazerEntrega?: () => void
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
        <div className="flex flex-wrap items-center gap-2">
          {salvo && <span className="text-xs text-emerald-600">Salvo!</span>}
          {entregueEm ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
              title={entreguePor ? `Marcado por ${entreguePor}` : undefined}
            >
              ✓ Entregue em {new Date(entregueEm).toLocaleDateString('pt-BR')}
            </span>
          ) : (
            inicial.previsaoEntrega && <SeloPrevisao previsao={inicial.previsaoEntrega} />
          )}
          {entregueEm && onDesfazerEntrega && (
            <button type="button" onClick={onDesfazerEntrega} className="text-xs text-ink-500 underline hover:text-ink-800">
              Desfazer entrega
            </button>
          )}
          {!entregueEm && onMarcarEntregue && (
            <button
              type="button"
              onClick={onMarcarEntregue}
              className="rounded-lg border border-emerald-600 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              ✓ Marcar como entregue
            </button>
          )}
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
