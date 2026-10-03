import { useId } from 'react'
import type { ReactNode } from 'react'

type ScreenLayoutProps = {
  title: string
  children: ReactNode
  scrollable?: boolean
  footer?: ReactNode
}

export default function ScreenLayout({ title, children, scrollable = false, footer }: ScreenLayoutProps) {
  const id = useId()
  return (
    <section className={scrollable ? 'screen screen-scroll' : 'screen'} aria-labelledby={id}>
      <h1 id={id}>{title}</h1>
      {scrollable ? <div className="screen-content" tabIndex={0} aria-label={`${title} content`}>{children}</div> : children}
      {footer && <div className="screen-footer">{footer}</div>}
    </section>
  )
}
