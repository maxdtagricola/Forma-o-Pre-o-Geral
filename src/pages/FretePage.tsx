import { useEffect, useState } from 'react'
import { SelectField } from '../components/ui/Field'
import { getEmpresaPorTransportadora, setEmpresaPorTransportadora } from '../db/configRepo'
import { listEmpresas } from '../db/empresasRepo'
import { TRANSPORTADORAS } from '../types'
import type { Empresa } from '../types'

function CardTransportadora({
  nome,
  empresas,
  empresaId,
  onChangeEmpresa,
}: {
  nome: string
  empresas: Empresa[]
  empresaId: string
  onChangeEmpresa: (empresaId: string) => void
}) {
  const empresa = empresas.find((e) => e.id === empresaId)
  const empresaOptions = [{ value: '', label: '— selecione —' }, ...empresas.map((e) => ({ value: e.id, label: e.nome }))]

  return (
    <div className="card">
      <h3 className="font-display text-base font-semibold text-ink-900 mb-3">{nome}</h3>
      <SelectField
        label="Empresa destino"
        value={empresaId}
        onChange={onChangeEmpresa}
        options={empresaOptions}
        hint={empresas.length === 0 ? 'Cadastre empresas em Configurações' : undefined}
      />
      {empresa && (
        <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50 p-3 text-xs text-ink-600">
          <p className="font-medium text-ink-800">{empresa.nome}</p>
          <p>CNPJ {empresa.cnpj || '—'}</p>
          <p>
            {empresa.endereco || '—'}
            {empresa.bairro ? ` · ${empresa.bairro}` : ''}
          </p>
          <p>
            {empresa.cep || '—'} · {empresa.municipio || '—'}
            {empresa.municipio && empresa.uf ? ' - ' : ''}
            {empresa.uf || ''}
          </p>
          <p className="mt-2 text-ink-400">Frete automático por destino em breve.</p>
        </div>
      )}
    </div>
  )
}

export function FretePage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaPorTransportadora, setEmpresaPorTransportadoraState] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listEmpresas(), getEmpresaPorTransportadora()])
      .then(([listaEmpresas, mapa]) => {
        setEmpresas(listaEmpresas)
        setEmpresaPorTransportadoraState(mapa)
      })
      .catch((err) => alert(err instanceof Error ? err.message : 'Erro ao carregar dados do servidor.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleChangeEmpresa(transportadora: string, empresaId: string) {
    setEmpresaPorTransportadoraState((prev) => ({ ...prev, [transportadora]: empresaId }))
    try {
      await setEmpresaPorTransportadora(transportadora, empresaId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar no servidor.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Frete</h2>
        <p className="text-sm text-ink-400">
          Escolha a empresa destino de cada transportadora — a base pro frete automático (cadastre as empresas em
          Configurações).
        </p>
      </div>

      {loading ? (
        <div className="card text-center text-sm text-ink-400 py-10">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRANSPORTADORAS.map((nome) => (
            <CardTransportadora
              key={nome}
              nome={nome}
              empresas={empresas}
              empresaId={empresaPorTransportadora[nome] ?? ''}
              onChangeEmpresa={(empresaId) => handleChangeEmpresa(nome, empresaId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
