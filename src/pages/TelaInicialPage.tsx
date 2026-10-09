import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { listQuotes, updateQuoteStatus } from '../db/analysesRepo'
import { PedidoCompraModal } from '../components/PedidoCompraModal'
import { avisar, pedirMotivoArquivamento } from '../dialogs'
import { DIAS_PARA_RETORNO, cotacoesEsperandoRetorno, diasDesdeOEnvio } from '../retornoCotacao'
import { SeloPrevisao, previsaoDaCotacao, situacaoDaPrevisao } from '../components/TransporteFornecedor'
import { SeloProducao } from '../components/SeloProducao'
import { itensDoPedidoDeCompra } from '../mudancaDeStatus'
import { getStatusColors } from '../db/configRepo'
import { listNotasFiscais } from '../db/notasFiscaisRepo'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { prejuizoAutomatico, valoresPorResultado } from '../notasFiscaisHelpers'
import { formatCurrency } from '../utils'
import { diasUteisDesde, textoDiasUteis, useVersaoFeriados } from '../diasUteis'
import { NOTA_FISCAL_STATUSES, QUOTE_STATUSES } from '../types'
import type { NotaFiscal, PedidoCompraInfo, QuoteRecord, QuoteStatus } from '../types'
import type { TabKey } from '../components/Layout'

// -----------------------------------------------------------------------
// Tela Inicial — a fila de trabalho de quem cota: as pendentes (esperando
// alguém pegar), as que estão em andamento com o usuário, as que estão em
// transporte e o que a equipe fez por último. Os números e gráficos do
// período ficam no Dashboard.
// -----------------------------------------------------------------------

/** Status em que a cotação já terminou — não aparece mais como trabalho em andamento. */
const STATUS_FINAIS: QuoteStatus[] = ['ENTREGUE', 'CONFERIDO', 'FATURADO', 'ARQUIVO']
/** Bloco EM ANDAMENTO: a cotação em si, até ANALISANDO VALORES — de ENVIADO em diante (resposta do
 * cliente, pedido, transporte…) já é outro processo; PENDENTE tem o bloco dela. */
const STATUS_EM_ANDAMENTO: QuoteStatus[] = ['AGUARDANDO FORNECEDOR', 'ANALISANDO VALORES']
/** Bloco EM TRANSPORTE: o que está a caminho — inclusive o que já chegou só em parte. */
const STATUS_EM_TRANSPORTE: QuoteStatus[] = ['EM TRANSPORTE', 'PARCIALMENTE ENTREGUE']
/** PENDENTE há mais dias úteis que isso fica marcado como atrasado. */
const DIAS_PENDENTE_ALERTA = 2
/** Produção com previsão de finalização a até esse tanto de dias úteis (ou já atrasada) vira aviso no topo. */
const DIAS_AVISO_PRODUCAO = 1
const ITENS_POR_BLOCO = 6

const DIA = 24 * 60 * 60 * 1000

function inicioDoDia(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Dias de calendário entre a data e hoje (0 = hoje, 1 = ontem). */
function diasDesde(ms: number, agora: number): number {
  return Math.round((inicioDoDia(agora) - inicioDoDia(ms)) / DIA)
}

function haQuanto(ms: number, agora: number): string {
  const minutos = Math.floor((agora - ms) / 60000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const dias = diasDesde(ms, agora)
  if (dias === 0) return `há ${Math.floor(minutos / 60)} h`
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

/** Quando a cotação entrou no status em que está agora. */
function desdeStatusAtual(r: QuoteRecord): number {
  for (let i = r.statusHistory.length - 1; i >= 0; i--) {
    if (r.statusHistory[i].status === r.status) return r.statusHistory[i].changedAt
  }
  return r.createdAt
}

/** Quando o cliente pediu (ou, sem essa data, quando a cotação foi criada). */
function dataDoPedido(r: QuoteRecord): number {
  return r.dataSolicitacao ?? r.createdAt
}

/** "há 3 dias úteis" / "hoje" — fim de semana e feriado não contam (ver diasUteis.ts). */
function haDiasUteis(ms: number, agora: number): string {
  const dias = diasUteisDesde(ms, agora)
  return dias === 0 ? 'hoje' : `há ${textoDiasUteis(dias)}`
}

function saudacao(agora: number): string {
  const hora = new Date(agora).getHours()
  return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
}

interface Evento {
  chave: string
  quando: number
  cotacao: QuoteRecord
  texto: string
  quem: string
}

export function TelaInicialPage({
  nomeExibido,
  currentAdmin,
  cotacaoAberta,
  onOpenQuote,
  onNovaCotacao,
  onContinuar,
  onIrPara,
}: {
  /** Nome de login (ex.: "MÁXIMUS"), pra saudação. */
  nomeExibido: string
  /** Como o app conhece o usuário (ex.: "Max") — é o responsável gravado nas cotações. */
  currentAdmin: string
  /** Cotação aberta agora na Precificação, se houver — vira o atalho "Continuar". */
  cotacaoAberta?: { codigo: string; cliente: string }
  onOpenQuote: (r: QuoteRecord) => void
  onNovaCotacao: (modo: 'manual' | 'importar') => void
  onContinuar: () => void
  onIrPara: (tab: TabKey) => void
}) {
  const [cotacoes, setCotacoes] = useState<QuoteRecord[]>([])
  // "Fechou" no bloco de retorno do cliente: a mesma janela de sempre (pedido completo ou só alguns itens)
  const [pedidoDoRetorno, setPedidoDoRetorno] = useState<QuoteRecord | undefined>(undefined)
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [coresStatus, setCoresStatus] = useState<Record<string, string>>({})
  const [agora] = useState(() => Date.now())
  useVersaoFeriados()
  const veTransferencias = currentAdmin === 'Max'

  useEffect(() => {
    listQuotes()
      .then(setCotacoes)
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar as cotações do servidor.'))
      .finally(() => setCarregando(false))
    getStatusColors()
      .then(setCoresStatus)
      .catch(() => {
        // cores customizadas são só um extra visual — sem elas, usa a paleta padrão
      })
    if (veTransferencias) {
      listNotasFiscais()
        .then(setNotas)
        .catch(() => {
          // o bloco de transferências é um extra — sem o servidor, ele só não aparece
        })
    }
  }, [veTransferencias])

  const hoje = inicioDoDia(agora)
  const blocos = useMemo(() => {
    const emAndamento = cotacoes.filter((r) => !STATUS_FINAIS.includes(r.status))
    const pendentes = emAndamento.filter((r) => r.status === 'PENDENTE').sort((a, b) => dataDoPedido(a) - dataDoPedido(b))
    const minhas = emAndamento
      .filter((r) => STATUS_EM_ANDAMENTO.includes(r.status) && r.responsavelStatus === currentAdmin)
      .sort((a, b) => QUOTE_STATUSES.indexOf(a.status) - QUOTE_STATUSES.indexOf(b.status) || desdeStatusAtual(a) - desdeStatusAtual(b))
    // com previsão de entrega primeiro (a mais próxima/atrasada no topo), depois as sem previsão
    const emTransporte = cotacoes
      .filter((r) => STATUS_EM_TRANSPORTE.includes(r.status))
      .sort((a, b) => {
        const pa = previsaoDaCotacao(a)
        const pb = previsaoDaCotacao(b)
        if (pa && pb) return pa.localeCompare(pb)
        if (pa || pb) return pa ? -1 : 1
        return desdeStatusAtual(a) - desdeStatusAtual(b)
      })

    // pedidos confirmados (em produção no fornecedor): com previsão de finalização primeiro, a mais
    // próxima/atrasada no topo
    const previsaoProducao = (r: QuoteRecord) => r.producao?.previsaoFinalizacao || ''
    const emProducao = cotacoes
      .filter((r) => r.status === 'PEDIDO CONFIRMADO')
      .sort((a, b) => {
        const pa = previsaoProducao(a)
        const pb = previsaoProducao(b)
        if (pa && pb) return pa.localeCompare(pb)
        if (pa || pb) return pa ? -1 : 1
        return desdeStatusAtual(a) - desdeStatusAtual(b)
      })
    const producaoChegando = emProducao.filter(
      (r) => previsaoProducao(r) && situacaoDaPrevisao(previsaoProducao(r), agora, 'producao').diasUteis <= DIAS_AVISO_PRODUCAO,
    )

    const eventos: Evento[] = []
    for (const r of cotacoes) {
      eventos.push({ chave: `${r.id}-criada`, quando: r.createdAt, cotacao: r, texto: 'criada', quem: r.criadoPor })
      r.statusHistory.forEach((h, i) => {
        if (i === 0 && h.status === 'PENDENTE') return // é a própria criação
        // o status só muda pelas mãos do responsável (quem tirou de PENDENTE), então é ele quem mudou
        eventos.push({ chave: `${r.id}-${i}`, quando: h.changedAt, cotacao: r, texto: h.status, quem: h.status === 'PENDENTE' ? '' : r.responsavelStatus })
      })
    }
    eventos.sort((a, b) => b.quando - a.quando)

    const algumaVez = (r: QuoteRecord, status: QuoteStatus, desde: number) => r.statusHistory.some((h) => h.status === status && h.changedAt >= desde)
    return {
      retorno: cotacoesEsperandoRetorno(cotacoes, currentAdmin, agora),
      pendentes,
      minhas,
      emProducao,
      producaoChegando,
      emTransporte,
      atividade: eventos.slice(0, 8),
      novasHoje: cotacoes.filter((r) => r.createdAt >= hoje).length,
      enviadasHoje: cotacoes.filter((r) => algumaVez(r, 'ENVIADO', hoje)).length,
      confirmadosSemana: cotacoes.filter((r) => algumaVez(r, 'PEDIDO CONFIRMADO', agora - 7 * DIA)).length,
    }
  }, [cotacoes, currentAdmin, agora, hoje])

  const transferencias = useMemo(() => {
    const abertas = notas.filter((n) => n.status !== 'CONCLUIDO' && n.status !== 'DEVOLUÇÃO')
    const porStatus = NOTA_FISCAL_STATUSES.map((status) => ({ status, quantidade: abertas.filter((n) => n.status === status).length })).filter(
      (s) => s.quantidade > 0,
    )
    const emPrejuizo = notas.filter((n) => prejuizoAutomatico(n) && valoresPorResultado(n).parado > 0)
    return {
      abertas: abertas.length,
      porStatus,
      prejuizo: emPrejuizo.reduce((s, n) => s + valoresPorResultado(n).parado, 0),
      notasEmPrejuizo: emPrejuizo.length,
    }
  }, [notas])

  async function recarregar() {
    try {
      setCotacoes(await listQuotes())
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar as cotações do servidor.')
    }
  }

  async function handleNaoFechou(r: QuoteRecord) {
    const arquivamento = await pedirMotivoArquivamento(`Por que a cotação ${r.codigo || ''} não foi fechada?`)
    if (!arquivamento) return
    try {
      await updateQuoteStatus(r.id, 'ARQUIVO', currentAdmin, undefined, arquivamento)
      await recarregar()
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao arquivar a cotação.')
    }
  }

  async function handleFechouConfirmado(info: PedidoCompraInfo) {
    const r = pedidoDoRetorno
    if (!r) return
    try {
      await updateQuoteStatus(r.id, 'PEDIDO DE COMPRA', currentAdmin, info)
      setPedidoDoRetorno(undefined)
      await recarregar()
      void avisar(`${r.codigo || 'A cotação'} seguiu para o Pedido de Compra.`)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  function corDoStatus(status: string, lista: readonly string[] = QUOTE_STATUSES): string {
    return coresStatus[status] || corPadraoDoStatus(status, lista)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink-900">
            {saudacao(agora)}, {nomeExibido}
          </h2>
          <p className="text-sm text-ink-400">O que precisa de atenção nas cotações hoje.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNovaCotacao('manual')}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            Nova cotação
          </button>
          <button
            type="button"
            onClick={() => onNovaCotacao('importar')}
            className="rounded-lg border border-ink-200 bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
          >
            Importar cotação
          </button>
          {cotacaoAberta && (
            <button
              type="button"
              onClick={onContinuar}
              title={cotacaoAberta.cliente}
              className="rounded-lg border border-ink-200 bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
            >
              Continuar {cotacaoAberta.codigo || 'cotação aberta'}
            </button>
          )}
        </div>
      </div>

      {erro && <p className="card text-sm text-rose-600">{erro}</p>}

      {carregando ? (
        <div className="card text-center text-sm text-ink-400 py-10">Carregando…</div>
      ) : (
        <>
          {blocos.retorno.length > 0 && (
            <section className="card border-amber-300 bg-amber-50/60" aria-label="Retorno do cliente">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">
                Retorno do cliente
                <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">{blocos.retorno.length}</span>
              </h3>
              <p className="mb-3 text-sm text-ink-600">
                Enviadas por você há {DIAS_PARA_RETORNO} dias ou mais — atualize: se fechou, siga pro pedido de compra; se não
                fechou, arquive com o motivo.
              </p>
              <div className="space-y-1">
                {blocos.retorno.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onOpenQuote(r)}
                      title="Abrir na Precificação"
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm text-ink-900">
                        <span className="font-mono text-xs text-ink-500">{r.codigo || '—'}</span>{' '}
                        <span className="font-medium">{r.cliente || '(sem cliente)'}</span>
                      </span>
                      <span className="block text-[11px] font-semibold text-amber-800">enviada há {diasDesdeOEnvio(r, agora)} dias</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPedidoDoRetorno(r)}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      Fechou
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleNaoFechou(r)}
                      className="rounded-lg border border-ink-200 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                    >
                      Não fechou
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {blocos.producaoChegando.length > 0 && (
            <section className="card border-sky-300 bg-sky-50/60" aria-label="Produção — previsão de finalização">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-ink-900">
                  Produção — previsão de finalização
                  <span className="ml-2 rounded-full bg-sky-200 px-2 py-0.5 text-xs font-semibold text-sky-900">{blocos.producaoChegando.length}</span>
                </h3>
                <button type="button" onClick={() => onIrPara('pedidoCompra')} className="text-xs font-medium text-ink-500 hover:text-ink-800">
                  Ver no Pedido de Compra →
                </button>
              </div>
              <p className="mb-3 text-sm text-ink-600">
                Pedidos confirmados com a produção ficando pronta {DIAS_AVISO_PRODUCAO === 1 ? 'até o próximo dia útil' : `em até ${DIAS_AVISO_PRODUCAO} dias úteis`}
                {' '}ou já atrasada — confirme com o fornecedor.
              </p>
              <div className="space-y-1">
                {blocos.producaoChegando.map((r) => (
                  <LinhaCotacao
                    key={r.id}
                    r={r}
                    onClick={() => onOpenQuote(r)}
                    direita={<SeloPrevisao previsao={r.producao!.previsaoFinalizacao!} agora={agora} tipo="producao" />}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Numero valor={blocos.novasHoje} rotulo={blocos.novasHoje === 1 ? 'cotação nova hoje' : 'cotações novas hoje'} />
            <Numero valor={blocos.enviadasHoje} rotulo={blocos.enviadasHoje === 1 ? 'enviada ao cliente hoje' : 'enviadas ao cliente hoje'} />
            <Numero
              valor={blocos.confirmadosSemana}
              rotulo={blocos.confirmadosSemana === 1 ? 'pedido confirmado nos últimos 7 dias' : 'pedidos confirmados nos últimos 7 dias'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <Bloco
              titulo="Pendentes"
              total={blocos.pendentes.length}
              vazio="Nenhuma cotação esperando — tudo já tem responsável."
              onVerTodas={() => onIrPara('cotacoes')}
            >
              {blocos.pendentes.slice(0, ITENS_POR_BLOCO).map((r) => {
                const dias = diasUteisDesde(dataDoPedido(r), agora)
                return (
                  <LinhaCotacao
                    key={r.id}
                    r={r}
                    onClick={() => onOpenQuote(r)}
                    direita={<Idade texto={dias === 0 ? 'pedida hoje' : `pendente há ${textoDiasUteis(dias)}`} alerta={dias > DIAS_PENDENTE_ALERTA} />}
                  />
                )
              })}
            </Bloco>

            <Bloco
              titulo="EM ANDAMENTO"
              total={blocos.minhas.length}
              vazio="Nenhuma cotação com você agora."
              onVerTodas={() => onIrPara('cotacoes')}
            >
              {blocos.minhas.slice(0, ITENS_POR_BLOCO).map((r) => (
                <LinhaCotacao
                  key={r.id}
                  r={r}
                  onClick={() => onOpenQuote(r)}
                  direita={
                    <span className="flex flex-col items-end gap-0.5">
                      <SeloStatus status={r.status} cor={corDoStatus(r.status)} />
                      <span className="text-[11px] text-ink-400">{haDiasUteis(desdeStatusAtual(r), agora)}</span>
                    </span>
                  }
                />
              ))}
            </Bloco>

            <Bloco
              titulo="EM PRODUÇÃO"
              total={blocos.emProducao.length}
              vazio="Nenhum pedido confirmado em produção."
              onVerTodas={() => onIrPara('pedidoCompra')}
              rotuloVerTodas="Ver no Pedido de Compra"
            >
              {blocos.emProducao.slice(0, ITENS_POR_BLOCO).map((r) => (
                <LinhaCotacao
                  key={r.id}
                  r={r}
                  onClick={() => onOpenQuote(r)}
                  direita={
                    <span className="flex flex-col items-end gap-0.5">
                      {r.producao ? (
                        <SeloProducao producao={r.producao} totalItens={itensDoPedidoDeCompra(r).length} agora={agora} />
                      ) : (
                        <span className="text-[11px] text-ink-400">produção não informada · {haDiasUteis(desdeStatusAtual(r), agora)}</span>
                      )}
                      {r.producao && !r.producao.previsaoFinalizacao && <span className="text-[11px] text-ink-400">sem previsão</span>}
                    </span>
                  }
                />
              ))}
            </Bloco>

            <Bloco
              titulo="EM TRANSPORTE"
              total={blocos.emTransporte.length}
              vazio="Nada em transporte."
              onVerTodas={() => onIrPara('cotacoes')}
            >
              {blocos.emTransporte.slice(0, ITENS_POR_BLOCO).map((r) => {
                const previsao = previsaoDaCotacao(r)
                return (
                  <LinhaCotacao
                    key={r.id}
                    r={r}
                    onClick={() => onOpenQuote(r)}
                    direita={
                      <span className="flex flex-col items-end gap-0.5">
                        <SeloStatus status={r.status} cor={corDoStatus(r.status)} />
                        {previsao ? (
                          <SeloPrevisao previsao={previsao} agora={agora} />
                        ) : (
                          <span className="text-[11px] text-ink-400">sem previsão · {haDiasUteis(desdeStatusAtual(r), agora)}</span>
                        )}
                      </span>
                    }
                  />
                )
              })}
            </Bloco>

            <Bloco
              titulo="Atividade recente da equipe"
              total={blocos.atividade.length}
              vazio="Nenhuma atividade ainda."
            >
              {blocos.atividade.map((e) => (
                <button
                  key={e.chave}
                  type="button"
                  onClick={() => onOpenQuote(e.cotacao)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-ink-50"
                >
                  <span className="font-mono text-xs text-ink-500">{e.cotacao.codigo || '—'}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-700">
                    {e.texto === 'criada' ? (
                      <>criada{e.quem ? <> por <strong className="font-medium">{e.quem}</strong></> : null}</>
                    ) : (
                      <>
                        <SeloStatus status={e.texto} cor={corDoStatus(e.texto)} />
                        {e.quem && <span className="ml-1.5 text-ink-500">· resp. {e.quem}</span>}
                      </>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-400">{haQuanto(e.quando, agora)}</span>
                </button>
              ))}
            </Bloco>

            {veTransferencias && (
              <Bloco
                titulo="Transferências fiscais"
                total={transferencias.abertas + transferencias.notasEmPrejuizo}
                vazio="Nenhuma transferência em aberto."
                onVerTodas={() => onIrPara('acompanhamentoNotas')}
                rotuloVerTodas="Ir para Transferências"
              >
                {transferencias.porStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between px-2 py-1 text-sm">
                    <SeloStatus status={s.status} cor={corDoStatus(s.status, NOTA_FISCAL_STATUSES)} />
                    <span className="font-semibold text-ink-800">{s.quantidade}</span>
                  </div>
                ))}
                {transferencias.notasEmPrejuizo > 0 && (
                  <p className="mt-1 rounded-lg bg-[#e34948]/10 px-3 py-2 text-sm text-[#b52d2c] dark:text-[#f19c9b]">
                    {transferencias.notasEmPrejuizo} nota{transferencias.notasEmPrejuizo === 1 ? '' : 's'} com prejuízo até vender:{' '}
                    <strong>{formatCurrency(transferencias.prejuizo)}</strong> — marque como faturado o que for vendido.
                  </p>
                )}
              </Bloco>
            )}
          </div>
        </>
      )}

      {pedidoDoRetorno && (
        <PedidoCompraModal quote={pedidoDoRetorno} onConfirm={handleFechouConfirmado} onCancel={() => setPedidoDoRetorno(undefined)} />
      )}
    </div>
  )
}

// --- pedaços --------------------------------------------------------------------------------

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="card flex items-baseline gap-3 py-4">
      <span className="font-display text-3xl font-bold tabular-nums text-ink-900">{valor}</span>
      <span className="text-sm text-ink-500">{rotulo}</span>
    </div>
  )
}

function Bloco({
  titulo,
  total,
  vazio,
  onVerTodas,
  rotuloVerTodas = 'Ver em Cotações',
  children,
}: {
  titulo: string
  total: number
  vazio: string
  onVerTodas?: () => void
  rotuloVerTodas?: string
  children: ReactNode
}) {
  return (
    <section className="card" aria-label={titulo}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-ink-900">
          {titulo}
          {total > 0 && <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">{total}</span>}
        </h3>
        {onVerTodas && total > ITENS_POR_BLOCO && (
          <button type="button" onClick={onVerTodas} className="shrink-0 text-xs text-brand-600 hover:underline">
            {rotuloVerTodas} (+{total - ITENS_POR_BLOCO})
          </button>
        )}
      </div>
      {total === 0 ? <p className="py-4 text-center text-sm text-ink-400">{vazio}</p> : <div className="space-y-1">{children}</div>}
    </section>
  )
}

function LinhaCotacao({ r, direita, onClick }: { r: QuoteRecord; direita: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Abrir na Precificação"
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-ink-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink-900">
          <span className="font-mono text-xs text-ink-500">{r.codigo || '—'}</span> <span className="font-medium">{r.cliente || '(sem cliente)'}</span>
        </span>
        <span className="block truncate text-[11px] text-ink-400">
          {[r.vendedor, r.maquina].filter(Boolean).join(' · ') || '—'}
        </span>
      </span>
      <span className="shrink-0 text-right">{direita}</span>
    </button>
  )
}

function SeloStatus({ status, cor }: { status: string; cor: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={{ backgroundColor: cor, color: corTexto(cor) }}>
      {status}
    </span>
  )
}

function Idade({ texto, alerta = false }: { texto: string; alerta?: boolean }) {
  return (
    <span
      className={`text-[11px] ${alerta ? 'font-semibold text-amber-700' : 'text-ink-400'}`}
      title={alerta ? `Pendente há mais de ${DIAS_PENDENTE_ALERTA} dias úteis` : undefined}
    >
      {alerta && '⚠ '}
      {texto}
    </span>
  )
}
