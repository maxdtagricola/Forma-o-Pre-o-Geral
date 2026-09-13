import type { ReactNode } from 'react'

export type TabKey =
  | 'cotacoes'
  | 'analytics'
  | 'dashboard'
  | 'margins'
  | 'produtos'
  | 'fornecedores'
  | 'configuracoes'
  | 'history'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'cotacoes', label: 'Cotações' },
  { key: 'analytics', label: 'Dashboard' },
  { key: 'dashboard', label: 'Precificação' },
  { key: 'margins', label: 'Análise de Margens' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'history', label: 'Histórico' },
]

export function Layout({
  active,
  onChangeTab,
  currentAdmin,
  onSwitchAdmin,
  children,
}: {
  active: TabKey
  onChangeTab: (tab: TabKey) => void
  currentAdmin: string
  onSwitchAdmin: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="bg-ink-50 border-b border-ink-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 font-display text-sm font-bold text-white">
                R$
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-ink-900 tracking-tight">Formação de Preço</h1>
                <p className="text-xs text-ink-400">Markup, ICMS-ST, RBC e PIS/COFINS</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-medium text-ink-700">{currentAdmin}</p>
              <button type="button" onClick={onSwitchAdmin} className="text-xs text-ink-400 hover:text-ink-600 transition">
                Trocar acesso
              </button>
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onChangeTab(tab.key)}
                className={`pill-tab ${
                  active === tab.key ? 'bg-ink-950 text-white' : 'text-ink-500 hover:bg-ink-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  )
}
