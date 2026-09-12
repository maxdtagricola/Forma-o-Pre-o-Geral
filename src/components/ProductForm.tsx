import { useState } from 'react'
import { NumberField, PercentField, SelectField, TextField } from './ui/Field'
import { ESTADOS } from '../data/estados'
import { findByInterno } from '../db/analysesRepo'
import { ESTADOS_DESTINO, type EstadoDestino } from '../types'
import type { ProductInput } from '../types'

const estadoOptions = ESTADOS.map((e) => ({ value: e.uf, label: `${e.uf} — ${e.nome}` }))
const perfilOptions = ESTADOS_DESTINO.map((e) => ({ value: e.value, label: e.label }))

export function ProductForm({
  product,
  onChange,
}: {
  product: ProductInput
  onChange: (patch: Partial<ProductInput>) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  async function handleInternoBlur() {
    const found = await findByInterno(product.interno)
    if (found) {
      onChange({
        referencia: found.referencia,
        ncm: found.ncm,
        descricao: found.descricao,
      })
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Dados do produto</h2>
          <p className="text-sm text-ink-400">Preencha ou edite — os cálculos atualizam sozinhos.</p>
        </div>
      </div>

      <div className="mb-4">
        <SelectField
          label="Perfil de cálculo (estado de destino)"
          value={product.perfil}
          onChange={(v) => onChange({ perfil: v as EstadoDestino })}
          options={perfilOptions}
          hint="Define qual planilha de referência (RBC, ICMS-ST) é usada nos cálculos"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Referência" value={product.referencia} onChange={(v) => onChange({ referencia: v })} />
        <TextField
          label="NCM"
          value={product.ncm}
          onChange={(v) => onChange({ ncm: v })}
          placeholder="0000.00.00"
          hint="Usado para classificar ICMS-ST, RBC e PIS/COFINS"
        />
        <TextField
          label="Interno"
          value={product.interno}
          onChange={(v) => onChange({ interno: v })}
          onBlur={handleInternoBlur}
          hint="Ao sair do campo, carrega referência, NCM e descrição de uma análise salva com o mesmo código"
        />
        <TextField label="Fornecedor" value={product.fornecedor} onChange={(v) => onChange({ fornecedor: v })} />
        <TextField label="Marca" value={product.marca} onChange={(v) => onChange({ marca: v })} />
        <SelectField
          label="Estado de origem"
          value={product.estadoOrigem}
          onChange={(v) => onChange({ estadoOrigem: v })}
          options={estadoOptions}
        />
        <PercentField
          label="Frete"
          value={product.freteRate}
          onChange={(v) => onChange({ freteRate: v })}
          hint="% sobre o valor do produto"
        />
        <NumberField label="Quantidade" value={product.qtd} onChange={(v) => onChange({ qtd: v })} min={0} step={1} />
        <TextField
          label="Descrição do produto"
          value={product.descricao}
          onChange={(v) => onChange({ descricao: v })}
          className="sm:col-span-2"
        />
        <NumberField
          label="Valor unitário"
          value={product.valorUnt}
          onChange={(v) => onChange({ valorUnt: v })}
          prefix="R$"
          step={0.01}
          min={0}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="mt-5 text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        {showAdvanced ? 'Ocultar campos avançados' : 'Mostrar campos avançados'}
      </button>

      {showAdvanced && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-ink-100 pt-4">
          <NumberField
            label="ST retido na nota"
            value={product.stRetido}
            onChange={(v) => onChange({ stRetido: v })}
            prefix="R$"
            step={0.01}
          />
          <NumberField
            label="Outras despesas"
            value={product.outrasDespesas}
            onChange={(v) => onChange({ outrasDespesas: v })}
            prefix="R$"
            step={0.01}
          />
          <NumberField
            label="Desconto"
            value={product.desconto}
            onChange={(v) => onChange({ desconto: v })}
            prefix="R$"
            step={0.01}
          />
          <NumberField label="IPI" value={product.ipi} onChange={(v) => onChange({ ipi: v })} prefix="R$" step={0.01} />
          <NumberField
            label="Frete adicional"
            value={product.freteAdicional}
            onChange={(v) => onChange({ freteAdicional: v })}
            prefix="R$"
            step={0.01}
            hint="Valor fixo, além do frete percentual"
          />
          <NumberField
            label="Crédito de ICMS sobre frete"
            value={product.credIcmsFrete}
            onChange={(v) => onChange({ credIcmsFrete: v })}
            prefix="R$"
            step={0.01}
          />
        </div>
      )}
    </div>
  )
}
