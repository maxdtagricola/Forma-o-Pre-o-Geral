import { useState } from 'react'
import { Button } from '../components/ui/Basics'
import { PlanilhaFornecedoresModal } from '../components/PlanilhaFornecedoresModal'
import { findByInterno } from '../db/analysesRepo'
import type { PreRegistroItem, QuoteStatus } from '../types'

export function PreRegistroPage({
  currentAdmin,
  isEditing,
  activeStatus,
  activeResponsavel,
  cliente,
  maquina,
  itens,
  onAddItem,
  onRemoveItem,
  onPatchItem,
  onSalvar,
  onIrParaPrecificacao,
  onGoToCotacoes,
}: {
  currentAdmin: string
  isEditing: boolean
  activeStatus: QuoteStatus
  activeResponsavel: string
  cliente: string
  maquina: string
  itens: PreRegistroItem[]
  onAddItem: () => void
  onRemoveItem: (id: string) => void
  onPatchItem: (id: string, patch: Partial<PreRegistroItem>) => void
  onSalvar: () => Promise<void>
  onIrParaPrecificacao: () => Promise<void>
  onGoToCotacoes: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  const [indo, setIndo] = useState(false)
  const [mostrarPlanilhaFornecedores, setMostrarPlanilhaFornecedores] = useState(false)

  const travadaPorOutro = activeStatus !== 'PENDENTE' && !!activeResponsavel && activeResponsavel !== currentAdmin

  if (!isEditing) {
    return (
      <div className="card text-center py-16">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Nenhuma cotação aberta</h2>
        <p className="text-sm text-ink-400 mb-5">
          Crie ou abra uma cotação na aba Cotações pra registrar os itens a cotar.
        </p>
        <Button variant="primary" onClick={onGoToCotacoes}>
          Ir para Cotações
        </Button>
      </div>
    )
  }

  async function handleInternoBlur(id: string, interno: string) {
    const found = await findByInterno(interno)
    if (found) {
      onPatchItem(id, { referencia: found.referencia })
    }
  }

  async function handleSalvar() {
    setSalvando(true)
    try {
      await onSalvar()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleIr() {
    setIndo(true)
    try {
      await onIrParaPrecificacao()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao ir para a precificação.')
    } finally {
      setIndo(false)
    }
  }

  const cellCls = 'px-1 py-1 border-t border-ink-100'
  const inputCls =
    'w-full bg-transparent border-0 rounded px-1.5 py-1.5 text-ink-800 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-60'

  return (
    <div className="space-y-6">
      {travadaPorOutro && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Esta cotação está sendo analisada por <strong>{activeResponsavel}</strong> — só ele(a) pode alterá-la
            agora.
          </p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Itens a cotar</h2>
            <p className="text-sm text-ink-400">
              Informe o código Interno e a quantidade de cada item — se o Interno já existir numa cotação salva, a
              Referência é carregada sozinha. Confira a lista e siga pra precificação quando estiver pronta.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="secondary"
              onClick={() => setMostrarPlanilhaFornecedores(true)}
              disabled={itens.length === 0}
            >
              Planilha para fornecedores
            </Button>
            <Button variant="secondary" onClick={onAddItem} disabled={travadaPorOutro}>
              + Adicionar item
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-ink-50 text-left text-ink-400">
                <th className="py-2 px-2 font-medium w-10">#</th>
                <th className="py-2 px-2 font-medium min-w-[10rem]">Interno</th>
                <th className="py-2 px-2 font-medium min-w-[10rem]">Referência</th>
                <th className="py-2 px-2 font-medium min-w-[12rem]">Descrição</th>
                <th className="py-2 px-2 font-medium w-28 text-right">Quantidade</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-ink-400 border-t border-ink-100">
                    Nenhum item registrado ainda.
                  </td>
                </tr>
              ) : (
                itens.map((item, index) => (
                  <tr key={item.id}>
                    <td className={`${cellCls} text-ink-400 text-xs text-center`}>{index + 1}</td>
                    <td className={cellCls}>
                      <input
                        className={`${inputCls} font-mono`}
                        value={item.interno}
                        disabled={travadaPorOutro}
                        onChange={(e) => onPatchItem(item.id, { interno: e.target.value })}
                        onBlur={(e) => handleInternoBlur(item.id, e.target.value)}
                      />
                    </td>
                    <td className={cellCls}>
                      <input
                        className={inputCls}
                        value={item.referencia}
                        disabled={travadaPorOutro}
                        onChange={(e) => onPatchItem(item.id, { referencia: e.target.value })}
                      />
                    </td>
                    <td className={cellCls}>
                      <input
                        className={inputCls}
                        value={item.descricao ?? ''}
                        disabled={travadaPorOutro}
                        onChange={(e) => onPatchItem(item.id, { descricao: e.target.value })}
                      />
                    </td>
                    <td className={cellCls}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className={`${inputCls} text-right tabular-nums`}
                        value={item.quantidade}
                        disabled={travadaPorOutro}
                        onChange={(e) => onPatchItem(item.id, { quantidade: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className={`${cellCls} text-center`}>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        disabled={travadaPorOutro}
                        aria-label="Remover item"
                        className="h-6 w-6 rounded-full text-xs leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition disabled:opacity-60"
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

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={handleSalvar} disabled={travadaPorOutro || salvando}>
            Salvar
          </Button>
          <Button variant="primary" onClick={handleIr} disabled={travadaPorOutro || indo}>
            Ir para precificação →
          </Button>
        </div>
      </div>

      {mostrarPlanilhaFornecedores && (
        <PlanilhaFornecedoresModal
          itens={itens}
          cliente={cliente}
          maquina={maquina}
          onClose={() => setMostrarPlanilhaFornecedores(false)}
        />
      )}
    </div>
  )
}
