import type { ReactNode } from 'react'

export function StepCard({
  step,
  title,
  description,
  aside,
  children
}: {
  step: number
  title: string
  description: string
  aside?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="step-card">
      <header className="step-card__header">
        <span className="step-card__number">{String(step).padStart(2, '0')}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {aside && <div className="step-card__aside">{aside}</div>}
      </header>
      <div className="step-card__content">{children}</div>
    </section>
  )
}
