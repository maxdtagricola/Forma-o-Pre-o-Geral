import { TRANSPORTADORAS } from '../types'

export function FretePage() {
  return (
    <div className="space-y-5">
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-ink-900 mb-1">Frete</h2>
        <p className="text-sm text-ink-400">Espaço reservado para cada transportadora — mais informações em breve.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TRANSPORTADORAS.map((nome) => (
          <div key={nome} className="card">
            <h3 className="font-display text-base font-semibold text-ink-900">{nome}</h3>
          </div>
        ))}
      </div>
    </div>
  )
}
