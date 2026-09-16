import { useMemo, useState } from 'react'
import { ProductForm } from '../components/ProductForm'
import { PricingConfigPanel } from '../components/PricingConfigPanel'
import { ResultPanel } from '../components/ResultPanel'
import { QuoteItemsList } from '../components/QuoteItemsList'
import { FreightSplitPanel } from '../components/FreightSplitPanel'
import { EnvioCotacaoModal } from '../components/EnvioCotacaoModal'
import { ItensACotarCard } from '../components/ItensACotarCard'
import { Button } from '../components/ui/Basics'
import { SelectField, TextField } from '../components/ui/Field'
import { calculateItem } from '../calc/calculator'
import { dateToInputValue, formatCurrency, formatDate, inputValueToDate } from '../utils'
import { TIPOS_REFERENCIA, VENDEDORES } from '../types'
import type {
  CalculationResult,
  Empresa,
  PreRegistroItem,
  PricingConfig,
  ProductInput,
  QuoteItem,
  QuoteStatus,
  TipoReferencia,
} from '../types'

const vendedorOptions = [{ value: '', label: '— selecione —' }, ...VENDEDORES.map((v) => ({ value: v, label: v }))]
const tipoReferenciaOptions = TIPOS_REFERENCIA.map((t) => ({ value: t.value, label: t.label }))

export function Dashboard({
  currentAdmin,
  codigo,
  activeStatus,
  activeResponsavel,
  vendedor,
  tipoReferencia,
  cliente,
  maquina,
  empresaId,
  empresas,
  onVendedorChange,
  onTipoReferenciaChange,
  onClienteChange,
  onMaquinaChange,
  onEmpresaIdChange,
  items,
  activeItemId,
  activeProduct,
  activePricing,
  result,
  isEditing,
  onSelectItem,
  onAddItem,
  onRemoveItem,
  onApplyFreightSplit,
  onPatchItem,
  onApplyMarginToAll,
  onProductChange,
  onPricingChange,
  onSave,
  onNew,
  onGoToCotacoes,
  onGoToComparar,
  onGoToFrete,
  onEnviarCotacao,
  temPlanilhaCliente,
  onVerPlanilhaCliente,
  createdAt,
  dataSolicitacao,
  onChangeDataSolicitacao,
  numeroCotacaoTransportadora,
  onChangeNumeroCotacaoTransportadora,
  preRegistroItems,
  onAddPreRegistroItem,
  onRemovePreRegistroItem,
  onPatchPreRegistroItem,
  onSalvarPreRegistro,
  onUsarPreRegistroNaPrecificacao,
  onEncaminharFornecedores,
}: {
  currentAdmin: string
  codigo: string
  activeStatus: QuoteStatus
  activeResponsavel: string
  vendedor: string
  tipoReferencia: TipoReferencia
  cliente: string
  maquina: string
  empresaId: string
  empresas: Empresa[]
  onVendedorChange: (value: string) => void
  onTipoReferenciaChange: (value: TipoReferencia) => void
  onClienteChange: (value: string) => void
  onMaquinaChange: (value: string) => void
  onEmpresaIdChange: (value: string) => void
  items: QuoteItem[]
  activeItemId: string
  activeProduct: ProductInput
  activePricing: PricingConfig
  result: CalculationResult
  isEditing: boolean
  onSelectItem: (id: string) => void
  onAddItem: () => void
  onRemoveItem: (id: string) => void
  onApplyFreightSplit: (valores: Record<string, number>) => void
  onPatchItem: (id: string, patch: Partial<ProductInput>) => void
  onApplyMarginToAll: (lucroPct: number) => void
  onProductChange: (patch: Partial<ProductInput>) => void
  onPricingChange: (patch: Partial<PricingConfig>) => void
  onSave: () => void
  onNew: () => void
  onGoToCotacoes: () => void
  onGoToComparar: () => void
  onGoToFrete: () => void
  onEnviarCotacao: () => Promise<void>
  temPlanilhaCliente: boolean
  onVerPlanilhaCliente: () => void
  createdAt?: number
  dataSolicitacao?: number
  onChangeDataSolicitacao: (ts: number | undefined) => void
  numeroCotacaoTransportadora: string
  onChangeNumeroCotacaoTransportadora: (v: string) => void
  preRegistroItems: PreRegistroItem[]
  onAddPreRegistroItem: () => void
  onRemovePreRegistroItem: (id: string) => void
  onPatchPreRegistroItem: (id: string, patch: Partial<PreRegistroItem>) => void
  onSalvarPreRegistro: () => Promise<void>
  onUsarPreRegistroNaPrecificacao: () => Promise<void>
  onEncaminharFornecedores: () => Promise<void>
}) {
  const [mostrarEnvioCotacao, setMostrarEnvioCotacao] = useState(false)
  const [itensACotarAberto, setItensACotarAberto] = useState(false)
  const travadaPorOutro = activeStatus !== 'PENDENTE' && !!activeResponsavel && activeResponsavel !== currentAdmin

  const empresaOptions = [
    { value: '', label: '— SELECIONE —' },
    ...empresas.map((e) => ({ value: e.id, label: e.nome })),
  ]

  const totalGeral = useMemo(
    () => items.reduce((sum, item) => sum + calculateItem(item.product, item.pricing).precoVendaTotal, 0),
    [items],
  )

  if (!isEditing) {
    return (
      <div className="card text-center py-16">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Nenhuma cotação aberta</h2>
        <p className="text-sm text-ink-400 mb-5">
          Crie ou abra uma cotação na aba Cotações pra começar a precificar os itens dela.
        </p>
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
            Esta cotação está sendo analisada por <strong>{activeResponsavel}</strong> — só ele(a) pode alterá-la
            agora. Você pode ver os dados, mas não vai conseguir salvar nenhuma mudança.
          </p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            Dados da cotação{codigo && <span className="ml-2 font-mono text-sm text-ink-400">{codigo}</span>}
          </h2>
          <div className="flex gap-2 shrink-0">
            {temPlanilhaCliente && (
              <Button variant="ghost" onClick={onVerPlanilhaCliente}>
                Planilha do cliente
              </Button>
            )}
            <Button variant="ghost" onClick={onGoToFrete}>
              Ir para Frete
            </Button>
            <Button variant="secondary" onClick={() => setMostrarEnvioCotacao(true)} disabled={items.length === 0}>
              Enviar cotação
            </Button>
          </div>
        </div>
        <p className="text-sm text-ink-400 mb-4">Informações gerais — servem de base pra recursos futuros.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField label="Vendedor" value={vendedor} onChange={onVendedorChange} options={vendedorOptions} />
          <SelectField
            label="Refere-se a"
            value={tipoReferencia}
            onChange={(v) => onTipoReferenciaChange(v as TipoReferencia)}
            options={tipoReferenciaOptions}
          />
          <TextField label="Cliente" value={cliente} onChange={onClienteChange} uppercase />
          <TextField label="Máquina" value={maquina} onChange={onMaquinaChange} />
          <SelectField
            label="Empresa (destinatário)"
            value={empresaId}
            onChange={onEmpresaIdChange}
            options={empresaOptions}
            hint={empresas.length === 0 ? 'Cadastre empresas em Configurações' : 'Usada pra carregar o frete automaticamente'}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2.5">
          <div>
            <p className="text-xs text-ink-400">Data criada</p>
            <p className="text-sm text-ink-700">{createdAt ? formatDate(createdAt) : '—'}</p>
          </div>
          <label className="block">
            <span className="field-label">Data de solicitação</span>
            <input
              type="date"
              className="field-input"
              value={dateToInputValue(dataSolicitacao)}
              disabled={travadaPorOutro}
              onChange={(e) => onChangeDataSolicitacao(inputValueToDate(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="field-label">Nº cotação transportadora</span>
            <input
              type="text"
              className="field-input"
              placeholder="informado pela transportadora"
              value={numeroCotacaoTransportadora}
              disabled={travadaPorOutro}
              onChange={(e) => onChangeNumeroCotacaoTransportadora(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <button
          type="button"
          onClick={() => setItensACotarAberto((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Itens a cotar</h2>
            <p className="text-sm text-ink-400">
              O que precisa ser cotado antes de ter preço de fornecedor — vale a pena antes de precificar de
              verdade.
              {preRegistroItems.length > 0 && ` ${preRegistroItems.length} item(ns) registrado(s).`}
            </p>
          </div>
          <span aria-hidden className={`shrink-0 text-ink-400 transition-transform ${itensACotarAberto ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
        {itensACotarAberto && (
          <div className="mt-4 pt-4 border-t border-ink-100">
            <ItensACotarCard
              travadaPorOutro={travadaPorOutro}
              cliente={cliente}
              maquina={maquina}
              itens={preRegistroItems}
              onAddItem={onAddPreRegistroItem}
              onRemoveItem={onRemovePreRegistroItem}
              onPatchItem={onPatchPreRegistroItem}
              onSalvar={onSalvarPreRegistro}
              onUsarNaPrecificacao={onUsarPreRegistroNaPrecificacao}
              onEncaminharFornecedores={onEncaminharFornecedores}
              onGoToComparar={onGoToComparar}
            />
          </div>
        )}
      </div>

      <QuoteItemsList
        items={items}
        activeItemId={activeItemId}
        onSelect={onSelectItem}
        onAdd={onAddItem}
        onRemove={onRemoveItem}
        onPatchItem={onPatchItem}
        onApplyMarginToAll={onApplyMarginToAll}
      />

      <FreightSplitPanel items={items} onApply={onApplyFreightSplit} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <ProductForm product={activeProduct} onChange={onProductChange} />
          <PricingConfigPanel key={activeItemId} pricing={activePricing} onChange={onPricingChange} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="sticky top-6 space-y-4">
            <ResultPanel result={result} qtd={activeProduct.qtd || 1} />

            {items.length > 1 && (
              <div className="card flex items-center justify-between">
                <span className="text-sm text-ink-500">Total da cotação ({items.length} itens)</span>
                <span className="font-mono font-semibold text-ink-900 tabular-nums">{formatCurrency(totalGeral)}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={onSave} disabled={travadaPorOutro}>
                Atualizar cotação
              </Button>
              <Button variant="secondary" onClick={onNew}>
                Nova cotação
              </Button>
            </div>
          </div>
        </div>
      </div>

      {mostrarEnvioCotacao && (
        <EnvioCotacaoModal
          items={items}
          cliente={cliente}
          maquina={maquina}
          codigo={codigo}
          onClose={() => setMostrarEnvioCotacao(false)}
          onEnviado={async () => {
            await onEnviarCotacao()
            setMostrarEnvioCotacao(false)
          }}
        />
      )}
    </div>
  )
}
