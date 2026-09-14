import { useEffect, useMemo, useState } from 'react'
import { listQuotes, updateQuoteStatus } from '../db/analysesRepo'
import { getStatusColors } from '../db/configRepo'
import { Button } from '../components/ui/Basics'
import { SelectField, TextField } from '../components/ui/Field'
import { PedidoCompraModal } from '../components/PedidoCompraModal'
import { lerPlanilhaCotacao, type ItemCotacaoImportado } from '../quoteImport'
import { arquivoParaBase64 } from '../planilhaCliente'
import { formatCurrency, formatDate, selecionarTudoAoFocar } from '../utils'
import { corPadraoDoStatus, corTexto } from '../statusColors'
import { QUOTE_STATUSES, TIPOS_REFERENCIA, VENDEDORES } from '../types'
import type { PedidoCompraInfo, QuoteRecord, QuoteStatus, TipoReferencia } from '../types'

const vendedorOptions = [{ value: '', label: '— selecione —' }, ...VENDEDORES.map((v) => ({ value: v, label: v }))]
const tipoOptions = TIPOS_REFERENCIA.map((t) => ({ value: t.value, label: t.label }))
const NOVO = '__novo__'

/** Correspondências case-insensitive, por igualdade ou substring em qualquer direção. */
function encontrarCorrespondencias(valor: string, conhecidos: string[]): string[] {
  const alvo = valor.trim().toLowerCase()
  if (!alvo) return []
  const vistos = new Set<string>()
  const resultado: string[] = []
  for (const c of conhecidos) {
    const atual = c.trim().toLowerCase()
    if (!atual || vistos.has(atual)) continue
    if (atual === alvo || atual.includes(alvo) || alvo.includes(atual)) {
      vistos.add(atual)
      resultado.push(c)
    }
  }
  return resultado
}

export function CotacoesPage({
  refreshKey,
  currentAdmin,
  onCreateQuote,
  onImportQuote,
  onOpenQuote,
}: {
  refreshKey: number
  currentAdmin: string
  onCreateQuote: (vendedor: string, cliente: string, maquina: string, tipo: TipoReferencia) => Promise<void>
  onImportQuote: (
    vendedor: string,
    cliente: string,
    maquina: string,
    itens: ItemCotacaoImportado[],
    planilhaOriginal: { nomeArquivo: string; conteudoBase64: string },
  ) => Promise<void>
  onOpenQuote: (record: QuoteRecord) => void
}) {
  const [records, setRecords] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [modoNovo, setModoNovo] = useState<'manual' | 'importar'>('manual')
  const [vendedor, setVendedor] = useState('')
  const [cliente, setCliente] = useState('')
  const [maquina, setMaquina] = useState('')
  const [tipo, setTipo] = useState<TipoReferencia>('itens')
  const [criando, setCriando] = useState(false)
  const [pedidoModalRecord, setPedidoModalRecord] = useState<QuoteRecord | undefined>(undefined)
  const [coresStatus, setCoresStatus] = useState<Record<string, string>>({})

  // --- importar planilha de cotação -----------------------------------------
  const [lendoArquivo, setLendoArquivo] = useState(false)
  const [importado, setImportado] = useState(false)
  const [clienteMatches, setClienteMatches] = useState<string[]>([])
  const [clienteEscolha, setClienteEscolha] = useState('')
  const [clienteNovoTexto, setClienteNovoTexto] = useState('')
  const [maquinaMatches, setMaquinaMatches] = useState<string[]>([])
  const [maquinaEscolha, setMaquinaEscolha] = useState('')
  const [maquinaNovoTexto, setMaquinaNovoTexto] = useState('')
  const [vendedorImport, setVendedorImport] = useState('')
  const [itensImportados, setItensImportados] = useState<ItemCotacaoImportado[]>([])
  const [arquivoImportado, setArquivoImportado] = useState<File | undefined>(undefined)
  const [confirmandoImport, setConfirmandoImport] = useState(false)

  const clientesConhecidos = useMemo(
    () => Array.from(new Set(records.map((r) => r.cliente.trim()).filter(Boolean))),
    [records],
  )
  const maquinasConhecidas = useMemo(
    () => Array.from(new Set(records.map((r) => r.maquina.trim()).filter(Boolean))),
    [records],
  )

  function resetImportacao() {
    setImportado(false)
    setClienteMatches([])
    setClienteEscolha('')
    setClienteNovoTexto('')
    setMaquinaMatches([])
    setMaquinaEscolha('')
    setMaquinaNovoTexto('')
    setVendedorImport('')
    setItensImportados([])
    setArquivoImportado(undefined)
  }

  async function handleArquivoSelecionado(file: File) {
    setLendoArquivo(true)
    try {
      const resultado = await lerPlanilhaCotacao(file)
      const clMatches = encontrarCorrespondencias(resultado.cliente, clientesConhecidos)
      const maMatches = encontrarCorrespondencias(resultado.equipamento, maquinasConhecidas)
      setClienteMatches(clMatches)
      setClienteEscolha(clMatches[0] ?? NOVO)
      setClienteNovoTexto(resultado.cliente)
      setMaquinaMatches(maMatches)
      setMaquinaEscolha(maMatches[0] ?? NOVO)
      setMaquinaNovoTexto(resultado.equipamento)
      setVendedorImport(resultado.vendedor)
      setItensImportados(resultado.itens)
      setArquivoImportado(file)
      setImportado(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao ler a planilha.')
    } finally {
      setLendoArquivo(false)
    }
  }

  function handlePatchItemImportado(index: number, patch: Partial<ItemCotacaoImportado>) {
    setItensImportados((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }
  function handleRemoveItemImportado(index: number) {
    setItensImportados((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleConfirmarImportacao() {
    if (!vendedorImport) {
      alert('Selecione o vendedor.')
      return
    }
    const clienteFinal = clienteEscolha === NOVO ? clienteNovoTexto.trim().toUpperCase() : clienteEscolha
    const maquinaFinal = maquinaEscolha === NOVO ? maquinaNovoTexto.trim() : maquinaEscolha
    if (!clienteFinal) {
      alert('Informe o cliente.')
      return
    }
    if (!maquinaFinal) {
      alert('Informe a máquina.')
      return
    }
    if (itensImportados.length === 0) {
      alert('Nenhum item pra importar — remova a planilha e confira se ela tem itens marcados como "COTAR".')
      return
    }
    if (!arquivoImportado) {
      alert('Selecione o arquivo novamente.')
      return
    }
    setConfirmandoImport(true)
    try {
      const conteudoBase64 = await arquivoParaBase64(arquivoImportado)
      await onImportQuote(vendedorImport, clienteFinal, maquinaFinal, itensImportados, {
        nomeArquivo: arquivoImportado.name,
        conteudoBase64,
      })
      resetImportacao()
      setModoNovo('manual')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao importar a cotação.')
    } finally {
      setConfirmandoImport(false)
    }
  }

  async function refresh() {
    setLoading(true)
    try {
      setRecords(await listQuotes())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar cotações do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useEffect(() => {
    getStatusColors()
      .then(setCoresStatus)
      .catch(() => {
        // cores customizadas são só um extra visual — se o servidor falhar, usa a paleta padrão
      })
  }, [])

  function corDoStatus(status: string): string {
    return coresStatus[status] || corPadraoDoStatus(status)
  }

  async function handleCriar() {
    if (!vendedor) {
      alert('Selecione o vendedor.')
      return
    }
    if (!cliente.trim()) {
      alert('Informe o cliente.')
      return
    }
    if (!maquina.trim()) {
      alert('Informe a máquina.')
      return
    }
    setCriando(true)
    try {
      await onCreateQuote(vendedor, cliente, maquina, tipo)
      setVendedor('')
      setCliente('')
      setMaquina('')
      setTipo('itens')
    } finally {
      setCriando(false)
    }
  }

  async function handleStatusChange(record: QuoteRecord, novoStatus: QuoteStatus) {
    if (novoStatus === 'PEDIDO DE COMPRA') {
      setPedidoModalRecord(record)
      return
    }
    try {
      await updateQuoteStatus(record.id, novoStatus, currentAdmin)
      refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  async function handleConfirmPedidoCompra(info: PedidoCompraInfo) {
    if (!pedidoModalRecord) return
    try {
      await updateQuoteStatus(pedidoModalRecord.id, 'PEDIDO DE COMPRA', currentAdmin, info)
      setPedidoModalRecord(undefined)
      refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar o status.')
    }
  }

  const grupos = useMemo(() => {
    return QUOTE_STATUSES.map((status) => ({
      status,
      itens: records.filter((r) => r.status === status).sort((a, b) => b.createdAt - a.createdAt),
    })).filter((g) => g.itens.length > 0)
  }, [records])

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-display text-lg font-semibold text-ink-900">Nova cotação</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModoNovo('manual')}
              className={`pill-tab border ${
                modoNovo === 'manual' ? 'bg-ink-950 border-ink-950 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setModoNovo('importar')}
              className={`pill-tab border ${
                modoNovo === 'importar' ? 'bg-ink-950 border-ink-950 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              Importar planilha
            </button>
          </div>
        </div>

        {modoNovo === 'manual' ? (
          <>
            <p className="text-sm text-ink-400 mb-4">
              Identifique o vendedor, o cliente, a máquina e a que se refere — depois é só registrar os itens a cotar.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <SelectField label="Vendedor" value={vendedor} onChange={setVendedor} options={vendedorOptions} />
              <TextField label="Cliente" value={cliente} onChange={setCliente} uppercase />
              <TextField label="Máquina" value={maquina} onChange={setMaquina} />
              <SelectField
                label="Refere-se a"
                value={tipo}
                onChange={(v) => setTipo(v as TipoReferencia)}
                options={tipoOptions}
              />
            </div>
            <Button variant="primary" onClick={handleCriar} disabled={criando}>
              Criar cotação e registrar itens
            </Button>
          </>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-ink-400 mb-4">
              Envie a planilha de orçamento do cliente — o cliente e o equipamento são lidos do topo, e os itens sem
              prazo de entrega marcados como "COTAR" viram os itens a cotar dessa cotação.
            </p>
            <label className="block mb-4">
              <span className="field-label">Arquivo (.xlsx)</span>
              <input
                type="file"
                accept=".xlsx"
                className="field-input"
                disabled={lendoArquivo}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleArquivoSelecionado(file)
                  e.target.value = ''
                }}
              />
            </label>

            {lendoArquivo && <p className="text-sm text-ink-400">Lendo planilha…</p>}

            {importado && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="field-label">Cliente</span>
                    <select
                      className="field-input"
                      value={clienteEscolha}
                      onChange={(e) => setClienteEscolha(e.target.value)}
                    >
                      {clienteMatches.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value={NOVO}>+ Adicionar novo cliente</option>
                    </select>
                    {clienteEscolha === NOVO && (
                      <input
                        className="field-input uppercase mt-2"
                        value={clienteNovoTexto}
                        onChange={(e) => setClienteNovoTexto(e.target.value)}
                      />
                    )}
                  </div>
                  <div>
                    <span className="field-label">Máquina</span>
                    <select
                      className="field-input"
                      value={maquinaEscolha}
                      onChange={(e) => setMaquinaEscolha(e.target.value)}
                    >
                      {maquinaMatches.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value={NOVO}>+ Adicionar nova máquina</option>
                    </select>
                    {maquinaEscolha === NOVO && (
                      <input
                        className="field-input mt-2"
                        value={maquinaNovoTexto}
                        onChange={(e) => setMaquinaNovoTexto(e.target.value)}
                      />
                    )}
                  </div>
                </div>

                <SelectField
                  label="Vendedor"
                  value={vendedorImport}
                  onChange={setVendedorImport}
                  options={vendedorOptions}
                />

                <div>
                  <p className="field-label mb-2">Itens a cotar encontrados na planilha</p>
                  <div className="overflow-x-auto rounded-xl border border-ink-100">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-ink-50 text-left text-ink-400">
                          <th className="py-2 px-2 font-medium w-10">#</th>
                          <th className="py-2 px-2 font-medium min-w-[10rem]">Referência</th>
                          <th className="py-2 px-2 font-medium min-w-[14rem]">Descrição</th>
                          <th className="py-2 px-2 font-medium w-28 text-right">Quantidade</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensImportados.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-ink-400 border-t border-ink-100">
                              Nenhum item restante.
                            </td>
                          </tr>
                        ) : (
                          itensImportados.map((item, index) => (
                            <tr key={index}>
                              <td className="px-2 py-1 border-t border-ink-100 text-ink-400 text-xs text-center">
                                {index + 1}
                              </td>
                              <td className="px-1 py-1 border-t border-ink-100">
                                <input
                                  className="w-full bg-transparent border-0 rounded px-1.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-brand-400"
                                  value={item.referencia}
                                  onChange={(e) => handlePatchItemImportado(index, { referencia: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1 border-t border-ink-100">
                                <input
                                  className="w-full bg-transparent border-0 rounded px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                                  value={item.descricao}
                                  onChange={(e) => handlePatchItemImportado(index, { descricao: e.target.value })}
                                />
                              </td>
                              <td className="px-1 py-1 border-t border-ink-100">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full bg-transparent border-0 rounded px-1.5 py-1.5 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-400"
                                  value={item.quantidade}
                                  onChange={(e) =>
                                    handlePatchItemImportado(index, { quantidade: Number(e.target.value) || 0 })
                                  }
                                  onFocus={selecionarTudoAoFocar}
                                />
                              </td>
                              <td className="px-1 py-1 border-t border-ink-100 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemImportado(index)}
                                  aria-label="Remover item"
                                  className="h-6 w-6 rounded-full text-xs leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={resetImportacao}>
                    Cancelar
                  </Button>
                  <Button variant="primary" onClick={handleConfirmarImportacao} disabled={confirmandoImport}>
                    Criar cotação com esses itens
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Cotações por status</h2>

        {loading ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : grupos.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">Nenhuma cotação criada ainda.</p>
        ) : (
          <div className="space-y-6">
            {grupos.map((grupo) => (
              <div key={grupo.status}>
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
                        <th className="py-2 px-3 font-medium">Código</th>
                        <th className="py-2 px-3 font-medium">Nome</th>
                        <th className="py-2 px-3 font-medium">Data criada</th>
                        <th className="py-2 px-3 font-medium">Status</th>
                        <th className="py-2 px-3 font-medium">Em análise por</th>
                        <th className="py-2 px-3 font-medium text-right">Valor da cotação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.itens.map((r) => {
                        const travadaPorOutro = r.status !== 'PENDENTE' && !!r.responsavelStatus && r.responsavelStatus !== currentAdmin
                        return (
                          <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                            <td
                              onClick={() => onOpenQuote(r)}
                              className="cursor-pointer py-2 px-3 font-mono text-ink-500"
                            >
                              {r.codigo || '—'}
                            </td>
                            <td
                              onClick={() => onOpenQuote(r)}
                              className="cursor-pointer py-2 px-3 text-ink-800"
                            >
                              {r.vendedor || '—'} | {r.cliente || '(sem cliente)'}
                            </td>
                            <td onClick={() => onOpenQuote(r)} className="cursor-pointer py-2 px-3 text-ink-500">
                              {formatDate(r.createdAt)}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: corDoStatus(r.status) }}
                                />
                                <select
                                  value={r.status}
                                  disabled={travadaPorOutro}
                                  onChange={(e) => handleStatusChange(r, e.target.value as QuoteStatus)}
                                  className={`field-input text-xs py-1.5 ${travadaPorOutro ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  title={travadaPorOutro ? `Em análise por ${r.responsavelStatus} — só ele(a) pode mudar` : undefined}
                                >
                                  {QUOTE_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-ink-500">{r.responsavelStatus || '—'}</td>
                            <td
                              onClick={() => onOpenQuote(r)}
                              className="cursor-pointer py-2 px-3 text-right font-mono tabular-nums text-ink-800"
                            >
                              {r.summary.precoVendaTotalGeral > 0 ? formatCurrency(r.summary.precoVendaTotalGeral) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pedidoModalRecord && (
        <PedidoCompraModal
          quote={pedidoModalRecord}
          onConfirm={handleConfirmPedidoCompra}
          onCancel={() => setPedidoModalRecord(undefined)}
        />
      )}
    </div>
  )
}
