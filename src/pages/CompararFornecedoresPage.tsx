import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Basics'
import { AutocompleteField, TextField, NumberField } from '../components/ui/Field'
import { listFornecedores } from '../db/fornecedoresRepo'
import { formatCurrency } from '../utils'
import type { CotacaoFornecedorItem, Fornecedor, PreRegistroItem, QuoteStatus } from '../types'

function LinhaNovaCotacao({
  fornecedorSuggestions,
  onAdicionar,
  disabled,
}: {
  fornecedorSuggestions: { value: string; label: string }[]
  onAdicionar: (cotacao: Omit<CotacaoFornecedorItem, 'id'>) => void
  disabled: boolean
}) {
  const [fornecedor, setFornecedor] = useState('')
  const [marca, setMarca] = useState('')
  const [valorUnitario, setValorUnitario] = useState(0)

  function handleAdicionar() {
    if (!fornecedor.trim()) {
      alert('Informe o fornecedor.')
      return
    }
    if (valorUnitario <= 0) {
      alert('Informe o valor unitário cotado.')
      return
    }
    onAdicionar({ fornecedor: fornecedor.trim(), marca: marca.trim(), valorUnitario })
    setFornecedor('')
    setMarca('')
    setValorUnitario(0)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
      <AutocompleteField label="Fornecedor" value={fornecedor} onChange={setFornecedor} suggestions={fornecedorSuggestions} />
      <TextField label="Marca" value={marca} onChange={setMarca} />
      <NumberField label="Valor unitário" value={valorUnitario} onChange={setValorUnitario} prefix="R$" step={0.01} min={0} />
      <Button variant="secondary" onClick={handleAdicionar} disabled={disabled} className="mb-0.5">
        Adicionar
      </Button>
    </div>
  )
}

function CardItem({
  item,
  fornecedorSuggestions,
  onAddCotacao,
  onRemoveCotacao,
  travadaPorOutro,
}: {
  item: PreRegistroItem
  fornecedorSuggestions: { value: string; label: string }[]
  onAddCotacao: (cotacao: Omit<CotacaoFornecedorItem, 'id'>) => void
  onRemoveCotacao: (cotacaoId: string) => void
  travadaPorOutro: boolean
}) {
  const cotacoes = item.cotacoesFornecedores ?? []
  const menorValor = cotacoes.length > 0 ? Math.min(...cotacoes.map((c) => c.valorUnitario)) : undefined

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="font-medium text-ink-900">{item.referencia || '(sem referência)'}</p>
          <p className="text-xs text-ink-400">
            {item.descricao || '—'} · Qtd {item.quantidade}
          </p>
        </div>
        {menorValor !== undefined && (
          <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
            Melhor preço: {formatCurrency(menorValor)}
          </span>
        )}
      </div>

      {cotacoes.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-ink-50 text-left text-ink-400">
                <th className="py-2 px-2 font-medium">Fornecedor</th>
                <th className="py-2 px-2 font-medium">Marca</th>
                <th className="py-2 px-2 font-medium text-right">Valor unitário</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {cotacoes
                .slice()
                .sort((a, b) => a.valorUnitario - b.valorUnitario)
                .map((c) => {
                  const melhor = c.valorUnitario === menorValor
                  return (
                    <tr key={c.id} className={melhor ? 'bg-brand-50' : undefined}>
                      <td className={`py-2 px-2 border-t border-ink-100 ${melhor ? 'font-semibold text-brand-800' : 'text-ink-800'}`}>
                        {c.fornecedor}
                      </td>
                      <td className="py-2 px-2 border-t border-ink-100 text-ink-600">{c.marca || '—'}</td>
                      <td
                        className={`py-2 px-2 border-t border-ink-100 text-right font-mono tabular-nums ${melhor ? 'font-semibold text-brand-800' : 'text-ink-800'}`}
                      >
                        {formatCurrency(c.valorUnitario)}
                      </td>
                      <td className="py-2 px-2 border-t border-ink-100 text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveCotacao(c.id)}
                          disabled={travadaPorOutro}
                          aria-label="Remover cotação"
                          className="h-6 w-6 rounded-full text-xs leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition disabled:opacity-60"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {!travadaPorOutro && (
        <LinhaNovaCotacao fornecedorSuggestions={fornecedorSuggestions} onAdicionar={onAddCotacao} disabled={travadaPorOutro} />
      )}
    </div>
  )
}

export function CompararFornecedoresPage({
  currentAdmin,
  isEditing,
  activeStatus,
  activeResponsavel,
  itens,
  onAddCotacao,
  onRemoveCotacao,
  onSalvar,
  onGoToCotacoes,
  onGoToPreRegistro,
}: {
  currentAdmin: string
  isEditing: boolean
  activeStatus: QuoteStatus
  activeResponsavel: string
  itens: PreRegistroItem[]
  onAddCotacao: (itemId: string, cotacao: Omit<CotacaoFornecedorItem, 'id'>) => void
  onRemoveCotacao: (itemId: string, cotacaoId: string) => void
  onSalvar: () => Promise<void>
  onGoToCotacoes: () => void
  onGoToPreRegistro: () => void
}) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    listFornecedores()
      .then(setFornecedores)
      .catch(() => {
        // sugestão é só um extra — se o servidor estiver fora, o campo continua livre normalmente
      })
  }, [])

  const travadaPorOutro = activeStatus !== 'PENDENTE' && !!activeResponsavel && activeResponsavel !== currentAdmin
  const fornecedorSuggestions = fornecedores.map((f) => ({ value: f.id, label: f.nome }))

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

  if (!isEditing) {
    return (
      <div className="card text-center py-16">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Nenhuma cotação aberta</h2>
        <p className="text-sm text-ink-400 mb-5">Crie ou abra uma cotação na aba Cotações pra comparar fornecedores.</p>
        <Button variant="primary" onClick={onGoToCotacoes}>
          Ir para Cotações
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {travadaPorOutro && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Esta cotação está sendo analisada por <strong>{activeResponsavel}</strong> — só ele(a) pode alterá-la agora.
          </p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Comparar fornecedores</h2>
            <p className="text-sm text-ink-400">
              Vá registrando as cotações que os fornecedores devolverem — a mais barata de cada item já entra
              pré-preenchida quando você for pra precificação.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" onClick={onGoToPreRegistro}>
              Voltar para itens a cotar
            </Button>
            <Button variant="primary" onClick={handleSalvar} disabled={travadaPorOutro || salvando}>
              Salvar
            </Button>
          </div>
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-sm text-ink-400">Nenhum item registrado ainda — volte em "Itens a cotar" pra adicionar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {itens.map((item) => (
            <CardItem
              key={item.id}
              item={item}
              fornecedorSuggestions={fornecedorSuggestions}
              onAddCotacao={(cotacao) => onAddCotacao(item.id, cotacao)}
              onRemoveCotacao={(cotacaoId) => onRemoveCotacao(item.id, cotacaoId)}
              travadaPorOutro={travadaPorOutro}
            />
          ))}
        </div>
      )}
    </div>
  )
}
