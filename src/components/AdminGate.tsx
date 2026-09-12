import { ADMINS, type AdminName } from '../types'

export function AdminGate({ onSelect }: { onSelect: (admin: AdminName) => void }) {
  return (
    <div className="min-h-screen bg-ink-50 flex items-center justify-center px-4">
      <div className="card max-w-sm w-full text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 font-display text-base font-bold text-white">
          R$
        </div>
        <h1 className="font-display text-lg font-semibold text-ink-900 mb-1">Quem está usando?</h1>
        <p className="text-sm text-ink-400 mb-5">
          Só pra identificar quem criou cada cotação — todos têm acesso completo ao app.
        </p>
        <div className="flex flex-col gap-2">
          {ADMINS.map((admin) => (
            <button
              key={admin}
              type="button"
              onClick={() => onSelect(admin)}
              className="rounded-lg border border-ink-200 px-4 py-3 text-sm font-medium text-ink-800 hover:border-brand-600 hover:bg-ink-50 transition"
            >
              {admin}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
