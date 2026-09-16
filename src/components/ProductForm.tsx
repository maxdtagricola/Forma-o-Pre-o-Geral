import { useEffect, useState } from 'react'
import { AutocompleteField, NumberField, PercentField, SelectField, TextField } from './ui/Field'
import { ESTADOS } from '../data/estados'
import { findByInterno } from '../db/analysesRepo'
import { listFornecedores } from '../db/fornecedoresRepo'
import { ESTADOS_DESTINO, type EstadoDestino } from '../types'
import type { Fornecedor, ProductInput } from '../types'

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
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])

  useEffect(() => {
    listFornecedores()
      .then(setFornecedores)
      .catch(() => {
        // sugestão é só um extra — se o servidor estiver fora, o campo continua livre normalmente
      })
  }, [])

  const fornecedorSuggestions = fornecedores.map((f) => ({ value: f.id, label: f.nome }))

  function aplicarEstadoDoFornecedor(nome: string) {
    const alvo = nome.trim().toLowerCase()
    if (!alvo) return
    const encontrado = fornecedores.find((f) => f.nome.trim().toLowerCase() === alvo)
    if (encontrado) onChange({ estadoOrigem: encontrado.estado })
  }

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
        <AutocompleteField
          label="Fornecedor"
          value={product.fornecedor}
          onChange={(v) => onChange({ fornecedor: v })}
          suggestions={fornecedorSuggestions}
          onSelectSuggestion={(s) => {
            onChange({ fornecedor: s.label })
            aplicarEstadoDoFornecedor(s.label)
          }}
          onBlur={() => aplicarEstadoDoFornecedor(product.fornecedor)}
          hint="Ao digitar ou selecionar um fornecedor cadastrado, o estado de origem carrega sozinho"
        />
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
        <NumberField
          label="Valor do frete"
          prefix="R$"
          step={0.01}
          value={(product.qtd || 0) * (product.valorUnt || 0) * (product.freteRate || 0)}
          onChange={(v) => {
            const vlrProduto = (product.qtd || 0) * (product.valorUnt || 0)
            onChange({ freteRate: vlrProduto > 0 ? v / vlrProduto : 0 })
          }}
          hint="Digite o valor e a % acima se ajusta sozinha, ou vice-versa"
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
        <NumberField
          label="Peso (kg)"
          value={product.peso}
          onChange={(v) => onChange({ peso: v })}
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
