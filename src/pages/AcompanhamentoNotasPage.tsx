import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { TextField, AutocompleteField, NumberField, SelectField, DateField } from '../components/ui/Field'
import { Button } from '../components/ui/Basics'
import { deleteNotaFiscal, listNotasFiscais, saveNotaFiscal, updateNotaFiscalStatus } from '../db/notasFiscaisRepo'
import { listFornecedores } from '../db/fornecedoresRepo'
import { getStatusColors } from '../db/configRepo'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { formatCurrency, formatDate } from '../utils'
import { DEFAULT_NOTA_FISCAL, NOTA_FISCAL_STATUSES, NOTA_FISCAL_TIPOS, RECEBEDORES, TRANSPORTADORAS } from '../types'
import type { Fornecedor, NotaFiscal, NotaFiscalStatus, NotaFiscalTipo } from '../types'
import { chaveMes, chaveMesDaNota, labelDoMes, dataLimiteDoMes, corDoTipo, labelDoTipo } from '../notasFiscaisHelpers'
import { extrairDadosNotaFiscalPdf } from '../pdfNotaFiscal'
import { extrairDadosNotaFiscalXml } from '../xmlNotaFiscal'
import { useEstadoPersistente } from '../estadoPersistente'
import { avisar, confirmar } from '../dialogs'

const transportadoraSuggestions = TRANSPORTADORAS.map((t) => ({ value: t, label: t }))
const recebedorSuggestions = RECEBEDORES.map((r) => ({ value: r, label: r }))
const statusOptions = NOTA_FISCAL_STATUSES.map((s) => ({ value: s, label: s }))
const tipoOptions = NOTA_FISCAL_TIPOS

function NotaCard({
  n,
  corDoStatus,
  onEdit,
  onAbrirStatus,
}: {
  n: NotaFiscal
  corDoStatus: (status: string) => string
  onEdit: (n: NotaFiscal) => void
  onAbrirStatus: (n: NotaFiscal) => void
}) {
  const [expandido, setExpandido] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuAberto) return
    function aoClicarFora(e: Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [menuAberto])

  return (
    <div className="rounded-lg border border-ink-100 overflow-hidden">
      <div className="flex items-center gap-2 pl-1 pr-2 py-2">
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-label={expandido ? 'Recolher detalhes' : 'Expandir detalhes'}
          className="shrink-0 h-7 w-7 flex items-center justify-center rounded text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
        >
          <span className={`inline-block transition-transform ${expandido ? 'rotate-90' : ''}`}>▸</span>
        </button>

        <button
          type="button"
          onClick={() => onAbrirStatus(n)}
          title="Clique pra alterar o status"
          className="flex-1 min-w-0 flex flex-wrap items-center gap-2 text-left py-1"
        >
          <span className="font-mono text-sm text-ink-800">{n.numeroNfe}</span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: corDoStatus(n.status), color: corTexto(corDoStatus(n.status)) }}
          >
            {n.status}
          </span>
          <span className="ml-auto text-sm font-mono tabular-nums text-ink-600">{formatCurrency(n.valorNota)}</span>
        </button>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuAberto((v) => !v)
            }}
            aria-label="Mais opções"
            className="h-7 w-7 flex items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
          >
            ⋯
          </button>
          {menuAberto && (
            <div className="absolute right-0 top-8 z-10 w-32 rounded-lg border border-ink-100 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuAberto(false)
                  onEdit(n)
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
              >
                Editar
              </button>
            </div>
          )}
        </div>
      </div>

      {expandido && (
        <div className="px-3 pb-3 pt-1 border-t border-ink-50 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
          <div>
            <p className="text-ink-400">Tipo</p>
            <p className="text-ink-700 font-medium">{labelDoTipo(n.tipo ?? 'PECAS')}</p>
          </div>
          <div>
            <p className="text-ink-400">Fornecedor</p>
            <p className="text-ink-700">{n.fornecedor || '—'}</p>
          </div>
          <div>
            <p className="text-ink-400">Recebedor</p>
            <p className="text-ink-700">{n.recebedor || '—'}</p>
          </div>
          <div>
            <p className="text-ink-400">Transportadora</p>
            <p className="text-ink-700">{n.transportadora || '—'}</p>
          </div>
          <div>
            <p className="text-ink-400">Valor frete</p>
            <p className="text-ink-700 font-mono">{formatCurrency(n.valorFrete)}</p>
          </div>
          <div>
            <p className="text-ink-400">Emitida em</p>
            <p className="text-ink-700">
              {n.dataEmissao ? new Date(`${n.dataEmissao}T00:00:00`).toLocaleDateString('pt-BR') : '—'}
            </p>
          </div>
          <div>
            <p className="text-ink-400">Registrada em</p>
            <p className="text-ink-700">{formatDate(n.createdAt)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function GrupoStatusTable({
  grupo,
  corDoStatus,
  onEdit,
  onAbrirStatus,
}: {
  grupo: { status: NotaFiscalStatus; itens: NotaFiscal[] }
  corDoStatus: (status: string) => string
  onEdit: (n: NotaFiscal) => void
  onAbrirStatus: (n: NotaFiscal) => void
}) {
  const [aberto, setAberto] = useEstadoPersistente(`notas:grupoStatusAberto:${grupo.status}`, false)
  return (
    <div>
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-2 mb-2 text-left">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: corDoStatus(grupo.status), color: corTexto(corDoStatus(grupo.status)) }}
        >
          {grupo.status}
        </span>
        <span className="text-xs text-ink-400">{grupo.itens.length}</span>
        <span aria-hidden className={`ml-auto text-ink-400 transition-transform ${aberto ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {aberto && (
        <div className="space-y-2">
          {grupo.itens.map((n) => (
            <NotaCard key={n.id} n={n} corDoStatus={corDoStatus} onEdit={onEdit} onAbrirStatus={onAbrirStatus} />
          ))}
        </div>
      )}
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
  onAbrirStatus,
}: {
  mesKey: string
  itens: NotaFiscal[]
  expirado: boolean
  todasConcluidas: boolean
  corDoStatus: (status: string) => string
  onEdit: (n: NotaFiscal) => void
  onAbrirStatus: (n: NotaFiscal) => void
}) {
  const [aberta, setAberta] = useEstadoPersistente(`notas:pastaMesAberta:${mesKey}`, false)
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
                    onAbrirStatus={onAbrirStatus}
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

function AlterarStatusModal({
  nota,
  corDoStatus,
  onSelecionar,
  onFechar,
}: {
  nota: NotaFiscal
  corDoStatus: (status: string) => string
  onSelecionar: (status: NotaFiscalStatus) => void
  onFechar: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-sm p-4"
      onClick={onFechar}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-400">Alterar status</p>
            <h3 className="font-display text-base font-semibold text-ink-900 truncate">NF-e {nota.numeroNfe}</h3>
            <p className="text-xs text-ink-400 truncate">{nota.fornecedor || 'Fornecedor não informado'}</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 h-7 w-7 rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          {NOTA_FISCAL_STATUSES.map((s) => {
            const ativo = s === nota.status
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSelecionar(s)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition ${
                  ativo
                    ? 'border-ink-900 ring-2 ring-ink-900/10 bg-ink-50'
                    : 'border-ink-100 hover:border-ink-300 hover:bg-ink-50'
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: corDoStatus(s) }} />
                <span className="flex-1 text-ink-800">{s}</span>
                {ativo && <span className="text-xs text-ink-400">atual</span>}
              </button>
            )
          })}
        </div>
      </div>
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
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false)
  const [formRecolhido, setFormRecolhido] = useEstadoPersistente('notas:formRecolhido', true)
  const [notaParaStatus, setNotaParaStatus] = useState<NotaFiscal | null>(null)
  const [importandoArquivo, setImportandoArquivo] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setNotas(await listNotasFiscais())
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao carregar notas fiscais do servidor.')
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
      void avisar(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  async function handleSelecionarStatus(status: NotaFiscalStatus) {
    if (!notaParaStatus) return
    const nota = notaParaStatus
    setNotaParaStatus(null)
    await handleStatusChange(nota, status)
  }

  function patch(p: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...p }))
  }

  async function handleImportarArquivo(file: File) {
    const ehXml = /\.xml$/i.test(file.name) || file.type.includes('xml')
    const ehPdf = /\.pdf$/i.test(file.name) || file.type.includes('pdf')
    if (!ehXml && !ehPdf) {
      void avisar('Formato não reconhecido — envie o PDF (DANFE) ou o XML da NF-e.')
      return
    }
    setImportandoArquivo(true)
    try {
      const listas = {
        fornecedoresConhecidos: fornecedores.map((f) => f.nome),
        recebedoresConhecidos: RECEBEDORES,
        transportadorasConhecidas: TRANSPORTADORAS,
      }
      const dados = ehXml ? await extrairDadosNotaFiscalXml(file, listas) : await extrairDadosNotaFiscalPdf(file, listas)
      if (Object.keys(dados).length === 0) {
        void avisar('Não consegui reconhecer os dados dessa nota — confira se é o PDF ou XML da NF-e e preencha manualmente.')
        return
      }
      patch({
        ...(dados.numeroNfe ? { numeroNfe: dados.numeroNfe } : {}),
        ...(dados.dataEmissao ? { dataEmissao: dados.dataEmissao } : {}),
        ...(dados.valorNota !== undefined ? { valorNota: dados.valorNota } : {}),
        ...(dados.valorFrete !== undefined ? { valorFrete: dados.valorFrete } : {}),
        ...(dados.fornecedor ? { fornecedor: dados.fornecedor } : {}),
        ...(dados.recebedor ? { recebedor: dados.recebedor } : {}),
        ...(dados.transportadora ? { transportadora: dados.transportadora } : {}),
      })
      setFormRecolhido(false)
    } catch (err) {
      void avisar(err instanceof Error ? err.message : `Erro ao ler o ${ehXml ? 'XML' : 'PDF'} da nota fiscal.`)
    } finally {
      setImportandoArquivo(false)
    }
  }

  function handleCancelEdit() {
    setForm(DEFAULT_NOTA_FISCAL)
    setStatusInicial(NOTA_FISCAL_STATUSES[0])
    setEditingId(undefined)
  }

  async function handleSubmit() {
    if (!form.numeroNfe.trim()) {
      void avisar('Informe o número da NF-e.')
      return
    }
    const duplicada = notas.find(
      (n) => n.id !== editingId && n.numeroNfe.trim().toLowerCase() === form.numeroNfe.trim().toLowerCase(),
    )
    if (duplicada) {
      const continuar = await confirmar(
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
      void avisar(err instanceof Error ? err.message : 'Erro ao salvar a nota fiscal no servidor.')
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
    setFormRecolhido(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string, e?: MouseEvent) {
    e?.stopPropagation()
    if (!(await confirmar('Excluir esta nota fiscal? Essa ação não pode ser desfeita.'))) return
    try {
      await deleteNotaFiscal(id)
      if (editingId === id) handleCancelEdit()
      await refresh()
    } catch (err) {
      void avisar(err instanceof Error ? err.message : 'Erro ao excluir a nota fiscal no servidor.')
    }
  }

  const fornecedorSuggestions = useMemo(() => fornecedores.map((f) => ({ value: f.id, label: f.nome })), [fornecedores])

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
        <button
          type="button"
          onClick={() => setFormRecolhido((v) => !v)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Registro de Transferências
              {editingId && <span className="ml-2 text-xs font-medium text-brand-700">(editando)</span>}
            </h2>
          </div>
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-100 hover:border-ink-400 transition`}
          >
            {formRecolhido ? 'Expandir' : 'Recolher'}
            <span aria-hidden className={`transition-transform ${formRecolhido ? '' : 'rotate-180'}`}>
              ▾
            </span>
          </span>
        </button>

        {!formRecolhido && (
          <>
            <div className="mt-5 rounded-xl border border-dashed border-ink-200 p-4">
              <label className="block">
                <span className="field-label">Importar PDF ou XML da nota (preenche os campos automaticamente)</span>
                <input
                  type="file"
                  accept=".pdf,.xml,application/pdf,text/xml,application/xml"
                  disabled={importandoArquivo}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImportarArquivo(file)
                    e.target.value = ''
                  }}
                  className="field-input"
                />
              </label>
              {importandoArquivo && <p className="text-xs text-ink-400 mt-2">Lendo o arquivo…</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
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
          </>
        )}
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Transferências fiscais registradas</h2>
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
                    onAbrirStatus={setNotaParaStatus}
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
                onAbrirStatus={setNotaParaStatus}
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
                  onAbrirStatus={setNotaParaStatus}
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

      {notaParaStatus && (
        <AlterarStatusModal
          nota={notaParaStatus}
          corDoStatus={corDoStatus}
          onSelecionar={handleSelecionarStatus}
          onFechar={() => setNotaParaStatus(null)}
        />
      )}
    </div>
  )
}
