import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'amber' | 'danger'
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-600',
    brand: 'bg-brand-100 text-brand-700',
    amber: 'bg-amber-100 text-amber-800',
    danger: 'bg-rose-100 text-rose-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    secondary: 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50',
    ghost: 'text-ink-500 hover:bg-ink-100',
    danger: 'text-rose-600 hover:bg-rose-50',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
