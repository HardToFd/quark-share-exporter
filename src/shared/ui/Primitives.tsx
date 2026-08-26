import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Check } from 'lucide-react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}): React.JSX.Element {
  return <button className={`button button--${variant} ${className}`} {...props} />
}

export function Badge({
  tone = 'neutral',
  children
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
  children: ReactNode
}): React.JSX.Element {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function Field({
  label,
  hint,
  children,
  className = ''
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <label className={`field ${className}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className="input" {...props} />
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; description?: string }>
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={`segmented__item ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
          disabled={disabled}
          aria-pressed={value === option.value}
        >
          <span>{option.label}</span>
          {option.description && <small>{option.description}</small>}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <label className={`checkbox ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="checkbox__control">{checked && <Check size={13} strokeWidth={3} />}</span>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  )
}
