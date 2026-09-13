import { useEffect, useState, type ReactNode } from 'react'

export type TabKey =
  | 'cotacoes'
  | 'analytics'
  | 'dashboard'
  | 'preregistro'
  | 'margins'
  | 'produtos'
  | 'fornecedores'
  | 'configuracoes'
  | 'history'

interface NavGroup {
  label: string
  items: { key: TabKey; label: string }[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Cotações',
    items: [
      { key: 'cotacoes', label: 'Cotações' },
      { key: 'dashboard', label: 'Precificação' },
      { key: 'margins', label: 'Análise de Margens' },
    ],
  },
  {
    label: 'Visão geral',
    items: [{ key: 'analytics', label: 'Dashboard' }],
  },
  {
    label: 'Cadastros',
    items: [
      { key: 'produtos', label: 'Produtos' },
      { key: 'fornecedores', label: 'Fornecedores' },
    ],
  },
  {
    label: 'Histórico',
    items: [{ key: 'history', label: 'Histórico' }],
  },
  {
    label: 'Sistema',
    items: [{ key: 'configuracoes', label: 'Configurações' }],
  },
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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  function handleSelect(tab: TabKey) {
    onChangeTab(tab)
    setMobileOpen(false)
  }

  return (
    <div className="min-h-screen bg-ink-50 flex">
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 sm:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed sm:sticky top-0 h-screen z-40 flex flex-col border-r border-ink-100 bg-surface transition-all duration-200 w-64 ${
          collapsed ? 'sm:w-[4.5rem]' : 'sm:w-60'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} sm:translate-x-0`}
      >
        <div className="flex items-center gap-3 px-4 py-4 border-b border-ink-100">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 font-display text-sm font-bold text-white">
            R$
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="font-display text-base font-bold text-ink-900 tracking-tight truncate">
                Formação de Preço
              </h1>
              <p className="text-[11px] text-ink-400 truncate">Markup, ICMS-ST, RBC e PIS/COFINS</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label}>
              {collapsed ? (
                i > 0 && <div className="mx-2 mb-1 border-t border-ink-100" />
              ) : (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((tab) => {
                  const isActive = active === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleSelect(tab.key)}
                      title={collapsed ? tab.label : undefined}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                        isActive ? 'bg-ink-950 text-white' : 'text-ink-500 hover:bg-ink-100'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? 'bg-white' : 'bg-ink-300'}`} />
                      {!collapsed && <span className="truncate">{tab.label}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-100 p-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden sm:flex w-full items-center justify-center rounded-lg py-2 text-xs text-ink-400 hover:bg-ink-100 mb-2 transition"
          >
            {collapsed ? '»' : '« Recolher menu'}
          </button>
          {collapsed ? (
            <button
              type="button"
              onClick={onSwitchAdmin}
              title="Trocar acesso"
              className="w-full text-center text-xs text-ink-400 hover:text-ink-600 transition"
            >
              ⇄
            </button>
          ) : (
            <div>
              <p className="text-sm font-medium text-ink-700 truncate">{currentAdmin}</p>
              <button
                type="button"
                onClick={onSwitchAdmin}
                className="text-xs text-ink-400 hover:text-ink-600 transition"
              >
                Trocar acesso
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sm:hidden flex items-center justify-between gap-3 border-b border-ink-100 bg-surface px-4 py-3 sticky top-0 z-20">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 hover:bg-ink-100 transition"
            aria-label="Abrir menu"
          >
            ☰
          </button>
          <h1 className="font-display text-base font-bold text-ink-900">Formação de Preço</h1>
          <div className="w-9" />
        </header>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      </div>
    </div>
  )
}
