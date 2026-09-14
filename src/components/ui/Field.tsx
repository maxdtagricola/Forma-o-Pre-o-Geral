import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { selecionarTudoAoFocar } from '../../utils'

interface WrapperProps {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}

export function FieldWrapper({ label, hint, children, className }: WrapperProps) {
  return (
    <label className={className}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  hint?: string
  className?: string
  uppercase?: boolean
}

export function TextField({ label, value, onChange, onBlur, placeholder, hint, className, uppercase }: TextFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} className={className}>
      <input
        type="text"
        className={`field-input ${uppercase ? 'uppercase' : ''}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        onBlur={onBlur}
      />
    </FieldWrapper>
  )
}

interface DateFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  className?: string
}

export function DateField({ label, value, onChange, hint, className }: DateFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} className={className}>
      <input type="date" className="field-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </FieldWrapper>
  )
}

interface AutocompleteOption {
  value: string
  label: string
}

interface AutocompleteFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  onSelectSuggestion?: (option: AutocompleteOption) => void
  onBlur?: () => void
  suggestions: AutocompleteOption[]
  placeholder?: string
  hint?: string
  className?: string
}

/** Campo de texto livre com sugestões (busca por letra digitada) — continua aceitando qualquer valor. */
export function AutocompleteField({
  label,
  value,
  onChange,
  onSelectSuggestion,
  onBlur,
  suggestions,
  placeholder,
  hint,
  className,
}: AutocompleteFieldProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const termos = value.trim().toLowerCase().split(/\s+/).filter(Boolean)
    // cada palavra digitada precisa aparecer em algum lugar do nome — não precisa ser em ordem
    // nem contígua, então busca nomes grandes ("DANIEL TRATORES ARIQUEMES") por qualquer parte dele
    const list =
      termos.length === 0
        ? suggestions
        : suggestions.filter((s) => {
            const alvo = s.label.toLowerCase()
            return termos.every((termo) => alvo.includes(termo))
          })
    return list.slice(0, 8)
  }, [value, suggestions])

  useEffect(() => {
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <FieldWrapper label={label} hint={hint} className={className}>
      <div
        ref={wrapperRef}
        className="relative"
        onBlur={(e) => {
          // só fecha quando o foco sai do campo E da lista de sugestões — assim dar Tab
          // dentro da lista pula pro próximo nome em vez de fechar a busca
          const next = e.relatedTarget as Node | null
          if (!next || !wrapperRef.current?.contains(next)) {
            setOpen(false)
            onBlur?.()
          }
        }}
      >
        <input
          type="text"
          className="field-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-ink-200 bg-surface shadow-lg max-h-56 overflow-auto">
            {filtered.map((s) => (
              <button
                key={s.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(s.label)
                  onSelectSuggestion?.(s)
                  setOpen(false)
                }}
                onClick={() => {
                  onChange(s.label)
                  onSelectSuggestion?.(s)
                  setOpen(false)
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-ink-50 focus:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-400"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </FieldWrapper>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  hint?: string
  className?: string
  min?: number
  step?: number
  prefix?: string
}

export function NumberField({ label, value, onChange, hint, className, min, step = 1, prefix }: NumberFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} className={className}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-sm">
            {prefix}
          </span>
        )}
        <input
          type="number"
          className={`field-input field-input-mono ${prefix ? 'pl-9' : ''}`}
          value={Number.isFinite(value) ? value : 0}
          min={min}
          step={step}
          onChange={(e) => onChange(e.target.valueAsNumber || 0)}
          onFocus={selecionarTudoAoFocar}
        />
      </div>
    </FieldWrapper>
  )
}

interface PercentFieldProps {
  label: string
  /** valor em fração, ex.: 0.25 para 25% */
  value: number
  onChange: (fraction: number) => void
  hint?: string
  className?: string
}

export function PercentField({ label, value, onChange, hint, className }: PercentFieldProps) {
  const displayValue = Math.round(value * 10000) / 100
  return (
    <FieldWrapper label={label} hint={hint} className={className}>
      <div className="relative">
        <input
          type="number"
          className="field-input field-input-mono pr-8"
          value={Number.isFinite(displayValue) ? displayValue : 0}
          step={0.1}
          onChange={(e) => onChange((e.target.valueAsNumber || 0) / 100)}
          onFocus={selecionarTudoAoFocar}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 text-sm">
          %
        </span>
      </div>
    </FieldWrapper>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  hint?: string
  className?: string
}

export function SelectField({ label, value, onChange, options, hint, className }: SelectFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} className={className}>
      <select className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
}
