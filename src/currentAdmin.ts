import { ADMINS, type AdminName } from './types'

const KEY = 'currentAdmin'

export function getCurrentAdmin(): AdminName | null {
  const stored = localStorage.getItem(KEY)
  return (ADMINS as string[]).includes(stored || '') ? (stored as AdminName) : null
}

export function setCurrentAdmin(admin: AdminName): void {
  localStorage.setItem(KEY, admin)
}

export function clearCurrentAdmin(): void {
  localStorage.removeItem(KEY)
}
