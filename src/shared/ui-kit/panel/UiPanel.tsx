import type { ReactNode } from 'react'
import classNames from 'classnames/bind'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './UiPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiPanel'

type UiPanelProps = {
  children: ReactNode
  className?: string
  title?: string
  headActions?: ReactNode
}

export function UiPanel({ children, className, title, headActions }: UiPanelProps) {
  const hasHead = Boolean(title) || Boolean(headActions)

  return (
    <section className={cn(BLOCK_NAME, className)}>
      {hasHead && (
        <div className={cn(`${BLOCK_NAME}__head`)}>
          {title ? (
            <Typography variant="h2" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
              {title}
            </Typography>
          ) : (
            <div />
          )}
          {headActions}
        </div>
      )}
      {children}
    </section>
  )
}
