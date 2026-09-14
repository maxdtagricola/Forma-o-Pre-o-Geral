import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { TextField, AutocompleteField, NumberField, SelectField, DateField } from '../components/ui/Field'
import { Button } from '../components/ui/Basics'
import { DonutChart, limitarComOutros, type DonutDatum } from '../components/DonutChart'
import { GroupedBarChart } from '../components/BarChart'
import { StatTile } from '../components/StatTile'
import { deleteNotaFiscal, listNotasFiscais, saveNotaFiscal, updateNotaFiscalStatus } from '../db/notasFiscaisRepo'
import { listFornecedores } from '../db/fornecedoresRepo'
import { getStatusColors } from '../db/configRepo'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { formatCurrency, formatDate } from '../utils'
import { PERIODOS, inicioPeriodo, type Periodo } from '../periodo'
import { DEFAULT_NOTA_FISCAL, NOTA_FISCAL_STATUSES, NOTA_FISCAL_TIPOS, RECEBEDORES, TRANSPORTADORAS } from '../types'
import type { Fornecedor, NotaFiscal, NotaFiscalStatus, NotaFiscalTipo } from '../types'

const transportadoraSuggestions = TRANSPORTADORAS.map((t) => ({ value: t, label: t }))
const recebedorSuggestions = RECEBEDORES.map((r) => ({ value: r, label: r }))
const statusOptions = NOTA_FISCAL_STATUSES.map((s) => ({ value: s, label: s }))
const tipoOptions = NOTA_FISCAL_TIPOS

// cores fixas por tipo — mesma ordem da paleta categórica usada nos status, pra manter consistência visual
const CORES_TIPO: Record<NotaFiscalTipo, string> = { PECAS: '#2a78d6', IMPLEMENTOS: '#eb6834' }
function corDoTipo(tipo: NotaFiscalTipo): string {
  return CORES_TIPO[tipo] ?? CORES_TIPO.PECAS
}
function labelDoTipo(tipo: NotaFiscalTipo): string {
  return NOTA_FISCAL_TIPOS.find((t) => t.value === tipo)?.label ?? tipo
}

// ---------------------------------------------------------------------------
// Pastas por mês de referência (mês de emissão da nota, ou de registro quando
// a nota não tem data de emissão informada) — usadas pra arquivar meses
// anteriores sem perder o acesso a eles.
// ---------------------------------------------------------------------------
function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function chaveMesDaNota(n: NotaFiscal): string {
  const data = n.dataEmissao ? new Date(`${n.dataEmissao}T00:00:00`) : new Date(n.createdAt)
  return chaveMes(data)
}

function labelDoMes(mesKey: string): string {
  const [ano, mes] = mesKey.split('-').map(Number)
  const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function labelCurtoDoMes(mesKey: string): string {
  const [ano, mes] = mesKey.split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`
}

/** Data em que os três meses de retenção do mês de referência se encerram. */
function dataLimiteDoMes(mesKey: string): number {
  const [ano, mes] = mesKey.split('-').map(Number)
  return new Date(ano, mes - 1 + 3, 1).getTime()
}

function GrupoStatusTable({
  grupo,
  corDoStatus,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  grupo: { status: NotaFiscalStatus; itens: NotaFiscal[] }
  corDoStatus: (status: string) => string
  onEdit: (n: NotaFiscal) => void
  onDelete: (id: string, e?: MouseEvent) => void
  onStatusChange: (n: NotaFiscal, status: NotaFiscalStatus) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: corDoStatus(grupo.status), color: corTexto(corDoStatus(grupo.status)) }}
        >
          {grupo.status}
        </span>
        <span className="text-xs text-ink-400">{grupo.itens.length}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-ink-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-400 border-b border-ink-100">
              <th className="py-2 px-3 font-medium">NF-e</th>
              <th className="py-2 px-3 font-medium">Tipo</th>
              <th className="py-2 px-3 font-medium">Fornecedor</th>
              <th className="py-2 px-3 font-medium">Recebedor</th>
              <th className="py-2 px-3 font-medium">Transportadora</th>
              <th className="py-2 px-3 font-medium text-right">Valor nota</th>
              <th className="py-2 px-3 font-medium text-right">Valor frete</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium">Emitida em</th>
              <th className="py-2 px-3 font-medium">Registrada em</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {grupo.itens.map((n) => (
              <tr
                key={n.id}
                onClick={() => onEdit(n)}
                className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50 group"
              >
                <td className="py-2 px-3 font-mono text-ink-800">{n.numeroNfe}</td>
                <td className="py-2 px-3">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: corDoTipo(n.tipo ?? 'PECAS'),
                      color: corTexto(corDoTipo(n.tipo ?? 'PECAS')),
                    }}
                  >
                    {labelDoTipo(n.tipo ?? 'PECAS')}
                  </span>
                </td>
                <td className="py-2 px-3 text-ink-800">{n.fornecedor || '—'}</td>
                <td className="py-2 px-3 text-ink-600">{n.recebedor || '—'}</td>
                <td className="py-2 px-3 text-ink-600">{n.transportadora || '—'}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-800">
                  {formatCurrency(n.valorNota)}
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-ink-600">
                  {formatCurrency(n.valorFrete)}
                </td>
                <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: corDoStatus(n.status) }}
                    />
                    <select
                      value={n.status}
                      onChange={(e) => onStatusChange(n, e.target.value as NotaFiscalStatus)}
                      className="field-input text-xs py-1.5"
                    >
                      {NOTA_FISCAL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="py-2 px-3 text-ink-400">
                  {n.dataEmissao ? new Date(`${n.dataEmissao}T00:00:00`).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="py-2 px-3 text-ink-400">{formatDate(n.createdAt)}</td>
                <td className="py-2 px-3 text-center">
                  <span
                    onClick={(e) => onDelete(n.id, e)}
                    className="hidden group-hover:inline text-xs font-medium text-rose-600 hover:text-rose-700"
                  >
                    Excluir
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PastaMes({
  mesKey,
  itens,
  expirado,
  todasConcluidas,
  corDoStatus,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  mesKey: string
  itens: NotaFiscal[]
  expirado: boolean
  todasConcluidas: boolean
  corDoStatus: (status: string) => string
  onEdit: (n: NotaFiscal) => void
  onDelete: (id: string, e?: MouseEvent) => void
  onStatusChange: (n: NotaFiscal, status: NotaFiscalStatus) => void
}) {
  const [aberta, setAberta] = useState(false)
  const [completa, setCompleta] = useState(false)

  const valorTotal = itens.reduce((s, n) => s + n.valorNota, 0)
  const concluidas = itens.filter((n) => n.status === 'CONCLUIDO').length
  const diasRestantes = Math.ceil((dataLimiteDoMes(mesKey) - Date.now()) / (1000 * 60 * 60 * 24))

  const grupos = NOTA_FISCAL_STATUSES.map((status) => ({
    status,
    itens: itens.filter((n) => n.status === status).sort((a, b) => b.createdAt - a.createdAt),
  })).filter((g) => g.itens.length > 0)

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
            {itens.length} nota{itens.length === 1 ? '' : 's'}
          </span>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
            !expirado
              ? 'bg-brand-100 text-brand-700'
              : todasConcluidas
                ? 'bg-ink-200 text-ink-600'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {!expirado
            ? `Expira em ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}`
            : todasConcluidas
              ? 'Prazo encerrado'
              : 'Prazo encerrado — ainda em aberto'}
        </span>
      </button>

      {aberta && (
        <div className="p-4 border-t border-ink-100 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-ink-400 text-xs">Notas</p>
              <p className="font-medium text-ink-900">{itens.length}</p>
            </div>
            <div>
              <p className="text-ink-400 text-xs">Concluídas</p>
              <p className="font-medium text-ink-900">
                {concluidas}/{itens.length}
              </p>
            </div>
            <div>
              <p className="text-ink-400 text-xs">Valor total</p>
              <p className="font-medium text-ink-900">{formatCurrency(valorTotal)}</p>
            </div>
            <div>
              <p className="text-ink-400 text-xs">Valor de frete</p>
              <p className="font-medium text-ink-900">{formatCurrency(itens.reduce((s, n) => s + n.valorFrete, 0))}</p>
            </div>
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
                    grupo={grupo}
                    corDoStatus={corDoStatus}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
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

export function AcompanhamentoNotasPage({ currentAdmin }: { currentAdmin: string }) {
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(DEFAULT_NOTA_FISCAL)
  const [statusInicial, setStatusInicial] = useState<NotaFiscalStatus>(NOTA_FISCAL_STATUSES[0])
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [coresStatus, setCoresStatus] = useState<Record<string, string>>({})
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | NotaFiscalTipo>('TODOS')
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setNotas(await listNotasFiscais())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar notas fiscais do servidor.')
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

  async function handleStatusChange(nota: NotaFiscal, novoStatus: NotaFiscalStatus) {
    try {
      await updateNotaFiscalStatus(nota.id, novoStatus)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  function patch(p: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...p }))
  }

  function handleCancelEdit() {
    setForm(DEFAULT_NOTA_FISCAL)
    setStatusInicial(NOTA_FISCAL_STATUSES[0])
    setEditingId(undefined)
  }

  async function handleSubmit() {
    if (!form.numeroNfe.trim()) {
      alert('Informe o número da NF-e.')
      return
    }
    const duplicada = notas.find(
      (n) => n.id !== editingId && n.numeroNfe.trim().toLowerCase() === form.numeroNfe.trim().toLowerCase(),
    )
    if (duplicada) {
      const continuar = confirm(
        `Já existe uma nota registrada com o número "${form.numeroNfe.trim()}" (fornecedor: ${duplicada.fornecedor || '—'}). Deseja continuar mesmo assim?`,
      )
      if (!continuar) return
    }
    setSaving(true)
    try {
      await saveNotaFiscal(form, currentAdmin, editingId, statusInicial)
      handleCancelEdit()
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar a nota fiscal no servidor.')
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
    })
    setEditingId(n.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string, e?: MouseEvent) {
    e?.stopPropagation()
    if (!confirm('Excluir esta nota fiscal? Essa ação não pode ser desfeita.')) return
    try {
      await deleteNotaFiscal(id)
      if (editingId === id) handleCancelEdit()
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir a nota fiscal no servidor.')
    }
  }

  const fornecedorSuggestions = useMemo(() => fornecedores.map((f) => ({ value: f.id, label: f.nome })), [fornecedores])

  const notasDoPeriodo = useMemo(() => {
    const inicio = inicioPeriodo(periodo)
    return notas.filter(
      (n) => n.createdAt >= inicio && (tipoFiltro === 'TODOS' || (n.tipo ?? 'PECAS') === tipoFiltro),
    )
  }, [notas, periodo, tipoFiltro])

  const statusData: DonutDatum[] = useMemo(
    () =>
      NOTA_FISCAL_STATUSES.map((status) => ({
        label: status,
        value: notasDoPeriodo.filter((n) => n.status === status).length,
        color: corDoStatus(status),
      })).filter((d) => d.value > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notasDoPeriodo, coresStatus],
  )

  const valorTotalNotas = notasDoPeriodo.reduce((s, n) => s + n.valorNota, 0)
  const valorTotalFrete = notasDoPeriodo.reduce((s, n) => s + n.valorFrete, 0)

  // valores de transferência — soma do valor das notas por filial (recebedor) no período
  const valorPorRecebedorData: DonutDatum[] = useMemo(() => {
    const porRecebedor = new Map<string, number>()
    for (const n of notasDoPeriodo) {
      const chave = n.recebedor || '(sem recebedor)'
      porRecebedor.set(chave, (porRecebedor.get(chave) ?? 0) + n.valorNota)
    }
    return limitarComOutros(
      Array.from(porRecebedor.entries()).map(([label, value]) => ({ label, value })),
      7,
    )
  }, [notasDoPeriodo])

  // registros por mês (últimos 6 meses de referência), diferenciando peças de implementos —
  // tendência independente do período do dashboard acima
  const notasPorMesData = useMemo(() => {
    const porMes = new Map<string, Record<NotaFiscalTipo, { quantidade: number; valor: number }>>()
    for (const n of notas) {
      const chave = chaveMesDaNota(n)
      const tipo: NotaFiscalTipo = n.tipo ?? 'PECAS'
      if (!porMes.has(chave)) {
        porMes.set(chave, { PECAS: { quantidade: 0, valor: 0 }, IMPLEMENTOS: { quantidade: 0, valor: 0 } })
      }
      const atual = porMes.get(chave)![tipo]
      atual.quantidade += 1
      atual.valor += n.valorNota
    }
    return Array.from(porMes.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-6)
      .map(([mesKey, porTipo]) => ({ mesKey, porTipo }))
  }, [notas])

  const tipoSeries = tipoOptions.map((t) => ({ key: t.value, label: t.label, color: corDoTipo(t.value) }))

  const registrosPorMesChartData = notasPorMesData.map((d) => ({
    label: labelCurtoDoMes(d.mesKey),
    values: { PECAS: d.porTipo.PECAS.quantidade, IMPLEMENTOS: d.porTipo.IMPLEMENTOS.quantidade },
  }))

  const valoresPorMesChartData = notasPorMesData.map((d) => ({
    label: labelCurtoDoMes(d.mesKey),
    values: { PECAS: d.porTipo.PECAS.valor, IMPLEMENTOS: d.porTipo.IMPLEMENTOS.valor },
  }))

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notas
    return notas.filter(
      (n) =>
        n.numeroNfe.toLowerCase().includes(q) ||
        n.fornecedor.toLowerCase().includes(q) ||
        n.recebedor.toLowerCase().includes(q) ||
        n.transportadora.toLowerCase().includes(q),
    )
  }, [notas, query])

  const mesAtualKey = chaveMes(new Date())

  // notas do mês de referência atual — ficam sempre visíveis direto, sem precisar abrir pasta
  const notasMesAtual = useMemo(
    () => filtradas.filter((n) => chaveMesDaNota(n) === mesAtualKey),
    [filtradas, mesAtualKey],
  )

  // agrupa por status — dá pra ver de cara o que já foi concluído, o que tá em
  // processo e o que ainda falta, em vez de uma lista única misturada
  const gruposMesAtual = useMemo(() => {
    return NOTA_FISCAL_STATUSES.map((status) => ({
      status,
      itens: notasMesAtual.filter((n) => n.status === status).sort((a, b) => b.createdAt - a.createdAt),
    })).filter((g) => g.itens.length > 0)
  }, [notasMesAtual])

  // meses anteriores viram pastas — cada uma some da visualização quando o prazo de retenção
  // (3 meses após o mês de referência) já passou e todas as notas dela já foram concluídas
  const pastas = useMemo(() => {
    const porMes = new Map<string, NotaFiscal[]>()
    for (const n of filtradas) {
      const chave = chaveMesDaNota(n)
      if (chave === mesAtualKey) continue
      if (!porMes.has(chave)) porMes.set(chave, [])
      porMes.get(chave)!.push(n)
    }
    const agora = Date.now()
    return Array.from(porMes.entries())
      .map(([mesKey, itens]) => {
        const expirado = agora >= dataLimiteDoMes(mesKey)
        const todasConcluidas = itens.every((n) => n.status === 'CONCLUIDO')
        return { mesKey, itens, expirado, todasConcluidas, arquivada: expirado && todasConcluidas }
      })
      .sort((a, b) => (a.mesKey < b.mesKey ? 1 : -1))
  }, [filtradas, mesAtualKey])

  const pastasAtivas = pastas.filter((p) => !p.arquivada)
  const pastasArquivadas = pastas.filter((p) => p.arquivada)

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Dashboard</h2>
        <p className="text-sm text-ink-400 mb-4">Visão geral das notas fiscais no período selecionado.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriodo(p.value)}
              className={`pill-tab border ${
                periodo === p.value
                  ? 'bg-ink-950 border-ink-950 text-white'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['TODOS', ...tipoOptions.map((t) => t.value)] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => setTipoFiltro(valor)}
              className={`pill-tab border ${
                tipoFiltro === valor
                  ? 'bg-ink-950 border-ink-950 text-white'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              {valor === 'TODOS' ? 'Todos os tipos' : labelDoTipo(valor)}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile label="Notas no período" value={String(notasDoPeriodo.length)} />
            <StatTile label="Valor total das notas" value={formatCurrency(valorTotalNotas)} />
            <StatTile label="Valor total de frete" value={formatCurrency(valorTotalFrete)} />
          </div>

          <div className="card">
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Status das notas</h3>
            <p className="text-xs text-ink-400 mb-4">Quantidade de notas em cada status, no período selecionado.</p>
            <DonutChart
              data={statusData}
              centerValue={String(notasDoPeriodo.length)}
              centerLabel="Notas"
              valueFormatter={(v) => String(v)}
              emptyText="Nenhuma nota nesse período."
            />
          </div>

          <div className="card">
            <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Valores de transferência</h3>
            <p className="text-xs text-ink-400 mb-4">
              Soma do valor das notas por filial (recebedor), no período selecionado.
            </p>
            <DonutChart
              data={valorPorRecebedorData}
              centerValue={formatCurrency(valorTotalNotas)}
              centerLabel="Total"
              valueFormatter={formatCurrency}
              emptyText="Nenhuma nota com valor nesse período."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Registros por mês</h3>
              <p className="text-xs text-ink-400 mb-4">
                Quantidade de notas por mês de referência (emissão), peças x implementos, últimos meses.
              </p>
              <GroupedBarChart
                data={registrosPorMesChartData}
                series={tipoSeries}
                valueFormatter={(v) => String(v)}
                emptyText="Nenhuma nota registrada ainda."
              />
            </div>

            <div className="card">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">Valores do mês</h3>
              <p className="text-xs text-ink-400 mb-4">
                Soma do valor das notas por mês de referência (emissão), peças x implementos, últimos meses.
              </p>
              <GroupedBarChart
                data={valoresPorMesChartData}
                series={tipoSeries}
                valueFormatter={formatCurrency}
                emptyText="Nenhuma nota registrada ainda."
              />
            </div>
          </div>
        </>
      )}

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Registro de Notas</h2>
        <p className="text-sm text-ink-400 mb-5">Acompanhamento de notas — por enquanto só visível pra você.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Número da NF-e" value={form.numeroNfe} onChange={(v) => patch({ numeroNfe: v })} />
          <DateField label="Data de emissão" value={form.dataEmissao} onChange={(v) => patch({ dataEmissao: v })} />
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
            options={tipoOptions.map((t) => ({ value: t.value, label: t.label }))}
          />
          {!editingId && (
            <SelectField
              label="Status inicial"
              value={statusInicial}
              onChange={(v) => setStatusInicial(v as NotaFiscalStatus)}
              options={statusOptions}
            />
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {editingId ? 'Salvar alterações' : 'Adicionar Novo Registro'}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={handleCancelEdit}>
              Cancelar edição
            </Button>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Notas fiscais registradas</h2>
        <input
          type="text"
          className="field-input max-w-sm mb-4"
          placeholder="Buscar por NF-e, fornecedor, recebedor ou transportadora…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {loading ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">
            {notas.length === 0 ? 'Nenhuma nota fiscal registrada ainda.' : 'Nada encontrado.'}
          </p>
        ) : (
          <>
            <p className="text-xs font-medium text-ink-400 mb-2">{labelDoMes(mesAtualKey)} (mês atual)</p>
            {gruposMesAtual.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6 mb-2">Nenhuma nota com referência no mês atual.</p>
            ) : (
              <div className="space-y-6 mb-2">
                {gruposMesAtual.map((grupo) => (
                  <GrupoStatusTable
                    key={grupo.status}
                    grupo={grupo}
                    corDoStatus={corDoStatus}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!loading && pastasAtivas.length > 0 && (
        <div className="card">
          <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Meses anteriores</h2>
          <p className="text-sm text-ink-400 mb-4">
            Notas de meses de referência anteriores — clique numa pasta pra ver um resumo, e no botão pra abrir a
            visualização completa. Passados os 3 meses de retenção, uma pasta só sai da lista depois que todas as
            notas dela estiverem concluídas.
          </p>
          <div className="space-y-3">
            {pastasAtivas.map((p) => (
              <PastaMes
                key={p.mesKey}
                mesKey={p.mesKey}
                itens={p.itens}
                expirado={p.expirado}
                todasConcluidas={p.todasConcluidas}
                corDoStatus={corDoStatus}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && pastasArquivadas.length > 0 && (
        <div className="card">
          <button
            type="button"
            onClick={() => setMostrarArquivadas((v) => !v)}
            className="text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            {mostrarArquivadas ? 'Ocultar' : 'Ver'} pastas arquivadas ({pastasArquivadas.length})
          </button>
          {mostrarArquivadas && (
            <div className="space-y-3 mt-4">
              {pastasArquivadas.map((p) => (
                <PastaMes
                  key={p.mesKey}
                  mesKey={p.mesKey}
                  itens={p.itens}
                  expirado={p.expirado}
                  todasConcluidas={p.todasConcluidas}
                  corDoStatus={corDoStatus}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {editingId && (
          <button
            type="button"
            onClick={() => handleDelete(editingId)}
            className="h-10 px-4 rounded-full bg-rose-600 text-white text-sm font-medium shadow-lg hover:bg-rose-700 transition"
          >
            Excluir
          </button>
        )}
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Voltar ao topo"
          title="Voltar ao topo"
          className="h-11 w-11 rounded-full bg-ink-950 text-white text-lg shadow-lg hover:bg-ink-800 transition flex items-center justify-center"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
