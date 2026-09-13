import { ADMINS, type AdminName } from '../types'

export function AdminGate({ onSelect }: { onSelect: (admin: AdminName) => void }) {
  return (
    <div className="min-h-screen bg-ink-50 flex items-center justify-center px-4">
      <div className="card max-w-sm w-full text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 font-display text-base font-bold text-white">
          R$
        </div>
        <h1 className="font-display text-lg font-semibold text-ink-900 mb-5">Quem está usando?</h1>
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
