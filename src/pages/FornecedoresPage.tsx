import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { TextField, SelectField } from '../components/ui/Field'
import { Button } from '../components/ui/Basics'
import { PreviaImportacao } from '../components/PreviaImportacao'
import { ESTADOS } from '../data/estados'
import { deleteFornecedor, listFornecedores, saveFornecedor } from '../db/fornecedoresRepo'
import { lerPlanilhaFornecedores, type FornecedorImportado } from '../fornecedoresImport'
import { gerarPreviaPlanilha, type PreviaPlanilha } from '../xlsxSheetUtil'
import { DEFAULT_FORNECEDOR } from '../types'
import type { Fornecedor } from '../types'

const estadoOptions = ESTADOS.map((e) => ({ value: e.uf, label: `${e.uf} — ${e.nome}` }))

export function FornecedoresPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(DEFAULT_FORNECEDOR)
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  // --- importar planilha de fornecedores -------------------------------------
  const [lendoArquivo, setLendoArquivo] = useState(false)
  const [arquivoPendente, setArquivoPendente] = useState<File | undefined>(undefined)
  const [previaImport, setPreviaImport] = useState<PreviaPlanilha | undefined>(undefined)
  const [itensImportados, setItensImportados] = useState<FornecedorImportado[]>([])
  const [confirmandoImport, setConfirmandoImport] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setFornecedores(await listFornecedores())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar fornecedores do servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function patch(p: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...p }))
  }

  function handleCancelEdit() {
    setForm(DEFAULT_FORNECEDOR)
    setEditingId(undefined)
  }

  async function handleSubmit() {
    if (!form.nome.trim()) {
      alert('Informe pelo menos o nome do fornecedor.')
      return
    }
    setSaving(true)
    try {
      await saveFornecedor(form, editingId)
      handleCancelEdit()
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar fornecedor no servidor.')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(f: Fornecedor) {
    setForm({ cnpj: f.cnpj, nome: f.nome, cep: f.cep, rua: f.rua, numero: f.numero, cidade: f.cidade, estado: f.estado })
    setEditingId(f.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string, e?: MouseEvent) {
    e?.stopPropagation()
    if (!confirm('Excluir este fornecedor? Essa ação não pode ser desfeita.')) return
    try {
      await deleteFornecedor(id)
      if (editingId === id) handleCancelEdit()
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir fornecedor no servidor.')
    }
  }

  async function handleArquivoSelecionado(file: File) {
    setLendoArquivo(true)
    try {
      const previa = await gerarPreviaPlanilha(file)
      setArquivoPendente(file)
      setPreviaImport(previa)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao ler a planilha.')
    } finally {
      setLendoArquivo(false)
    }
  }

  function handleCancelarPrevia() {
    setArquivoPendente(undefined)
    setPreviaImport(undefined)
  }

  async function handleConfirmarPrevia() {
    if (!arquivoPendente) return
    setLendoArquivo(true)
    try {
      const resultado = await lerPlanilhaFornecedores(arquivoPendente)
      setItensImportados(resultado)
      setPreviaImport(undefined)
      setArquivoPendente(undefined)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao ler a planilha.')
    } finally {
      setLendoArquivo(false)
    }
  }

  function handlePatchItemImportado(index: number, patch: Partial<FornecedorImportado>) {
    setItensImportados((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }
  function handleRemoveItemImportado(index: number) {
    setItensImportados((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleConfirmarImportacao() {
    setConfirmandoImport(true)
    try {
      for (const item of itensImportados) {
        const cnpjAlvo = item.cnpj.trim()
        const existente = fornecedores.find((f) =>
          cnpjAlvo ? f.cnpj.trim() === cnpjAlvo : f.nome.trim().toLowerCase() === item.nome.trim().toLowerCase(),
        )
        await saveFornecedor(
          {
            cnpj: item.cnpj,
            nome: item.nome,
            cep: item.cep,
            rua: item.rua,
            numero: item.numero,
            cidade: item.cidade,
            estado: item.estado,
          },
          existente?.id,
        )
      }
      const total = itensImportados.length
      setItensImportados([])
      await refresh()
      alert(`${total} fornecedor(es) importado(s).`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao importar fornecedores.')
    } finally {
      setConfirmandoImport(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return fornecedores
    return fornecedores.filter(
      (f) => f.nome.toLowerCase().includes(q) || f.cnpj.toLowerCase().includes(q) || f.cidade.toLowerCase().includes(q),
    )
  }, [fornecedores, query])

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">
          {editingId ? 'Editar fornecedor' : 'Novo fornecedor'}
        </h2>
        <p className="text-sm text-ink-400 mb-5">
          Cadastre os dados completos do fornecedor — isso vai servir de base pra um futuro cálculo de frete pela
          origem de cada um.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="CNPJ" value={form.cnpj} onChange={(v) => patch({ cnpj: v })} placeholder="00.000.000/0000-00" />
          <TextField label="Nome" value={form.nome} onChange={(v) => patch({ nome: v })} />
          <TextField label="CEP" value={form.cep} onChange={(v) => patch({ cep: v })} placeholder="00000-000" />
          <TextField label="Rua" value={form.rua} onChange={(v) => patch({ rua: v })} />
          <TextField label="Número" value={form.numero} onChange={(v) => patch({ numero: v })} />
          <TextField label="Cidade" value={form.cidade} onChange={(v) => patch({ cidade: v })} />
          <SelectField label="Estado" value={form.estado} onChange={(v) => patch({ estado: v })} options={estadoOptions} />
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {editingId ? 'Salvar alterações' : 'Adicionar fornecedor'}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={handleCancelEdit}>
              Cancelar edição
            </Button>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Importar planilha</h2>
        <p className="text-sm text-ink-400 mb-4">
          Envie uma planilha com os fornecedores — a linha com "Nome" (ou "Fornecedor") é o cabeçalho, e as colunas
          CNPJ, CEP, Rua, Número, Cidade e Estado são lidas pelo texto do cabeçalho (todas opcionais, menos o nome).
          Quem já tiver o mesmo CNPJ (ou o mesmo nome, se não houver CNPJ) é atualizado em vez de duplicado.
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

        {previaImport && arquivoPendente && (
          <PreviaImportacao
            nomeArquivo={arquivoPendente.name}
            previa={previaImport}
            onConfirmar={handleConfirmarPrevia}
            onCancelar={handleCancelarPrevia}
            confirmando={lendoArquivo}
          />
        )}

        {itensImportados.length > 0 && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-ink-50 text-left text-ink-400">
                    <th className="py-2 px-2 font-medium w-10">#</th>
                    <th className="py-2 px-2 font-medium min-w-[12rem]">Nome</th>
                    <th className="py-2 px-2 font-medium min-w-[9rem]">CNPJ</th>
                    <th className="py-2 px-2 font-medium min-w-[9rem]">Cidade</th>
                    <th className="py-2 px-2 font-medium w-16">UF</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {itensImportados.map((item, index) => (
                    <tr key={index}>
                      <td className="px-2 py-1 border-t border-ink-100 text-ink-400 text-xs text-center">
                        {index + 1}
                      </td>
                      <td className="px-1 py-1 border-t border-ink-100">
                        <input
                          className="w-full bg-transparent border-0 rounded px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                          value={item.nome}
                          onChange={(e) => handlePatchItemImportado(index, { nome: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1 border-t border-ink-100">
                        <input
                          className="w-full bg-transparent border-0 rounded px-1.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-brand-400"
                          value={item.cnpj}
                          onChange={(e) => handlePatchItemImportado(index, { cnpj: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1 border-t border-ink-100">
                        <input
                          className="w-full bg-transparent border-0 rounded px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                          value={item.cidade}
                          onChange={(e) => handlePatchItemImportado(index, { cidade: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1 border-t border-ink-100">
                        <input
                          className="w-full bg-transparent border-0 rounded px-1.5 py-1.5 uppercase focus:outline-none focus:ring-1 focus:ring-brand-400"
                          value={item.estado}
                          onChange={(e) => handlePatchItemImportado(index, { estado: e.target.value.toUpperCase() })}
                        />
                      </td>
                      <td className="px-1 py-1 border-t border-ink-100 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemImportado(index)}
                          aria-label="Remover fornecedor"
                          className="h-6 w-6 rounded-full text-xs leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setItensImportados([])}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={handleConfirmarImportacao} disabled={confirmandoImport}>
                Importar {itensImportados.length} fornecedor{itensImportados.length === 1 ? '' : 'es'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Fornecedores cadastrados</h2>
        <input
          type="text"
          className="field-input max-w-sm mb-4"
          placeholder="Buscar por nome, CNPJ ou cidade…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {loading ? (
          <p className="text-sm text-ink-400 text-center py-6">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">
            {fornecedores.length === 0 ? 'Nenhum fornecedor cadastrado ainda.' : 'Nada encontrado.'}
          </p>
        ) : (
          <div className="divide-y divide-ink-100">
            {filtered.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleEdit(f)}
                className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-ink-50 -mx-2 px-2 rounded-lg transition group"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink-900 truncate">{f.nome}</p>
                  <p className="text-xs text-ink-400 truncate">
                    CNPJ {f.cnpj || '—'} · {f.rua || '—'}
                    {f.numero ? `, ${f.numero}` : ''} · {f.cidade || '—'}
                    {f.cidade && f.estado ? ' - ' : ''}
                    {f.estado || ''}
                  </p>
                </div>
                <span
                  onClick={(e) => handleDelete(f.id, e)}
                  className="hidden group-hover:inline text-xs font-medium text-rose-600 hover:text-rose-700 shrink-0"
                >
                  Excluir
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

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
