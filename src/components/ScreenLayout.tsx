import { useId } from 'react'
import type { ReactNode } from 'react'

type ScreenLayoutProps = {
  title: string
  children: ReactNode
}

export default function ScreenLayout({ title, children }: ScreenLayoutProps) {
  const id = useId()
  return (
    <section className="screen" aria-labelledby={id}>
      <h1 id={id}>{title}</h1>
      {children}
    </section>
  )
}

