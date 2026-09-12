import type { ReactNode } from 'react'

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
