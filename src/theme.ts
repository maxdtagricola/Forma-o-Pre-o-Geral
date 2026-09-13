export type Tema = 'claro' | 'escuro'

const KEY = 'tema'

export function getTema(): Tema {
  return localStorage.getItem(KEY) === 'escuro' ? 'escuro' : 'claro'
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.classList.toggle('dark', tema === 'escuro')
  localStorage.setItem(KEY, tema)
}
