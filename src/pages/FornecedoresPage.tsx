import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { TextField, SelectField } from '../components/ui/Field'
import { Button } from '../components/ui/Basics'
import { ESTADOS } from '../data/estados'
import { deleteFornecedor, listFornecedores, saveFornecedor } from '../db/fornecedoresRepo'
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
  }

  async function handleDelete(id: string, e: MouseEvent) {
    e.stopPropagation()
    if (!confirm('Excluir este fornecedor? Essa ação não pode ser desfeita.')) return
    try {
      await deleteFornecedor(id)
      if (editingId === id) handleCancelEdit()
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir fornecedor no servidor.')
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
    </div>
  )
}
