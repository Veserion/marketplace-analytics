import type { ReactNode } from 'react'
import classNames from 'classnames/bind'
import { UiCard } from '@/shared/ui-kit/card'
import { UiFlex } from '@/shared/ui-kit/flex'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

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
    <UiCard className={cn(BLOCK_NAME, className)} elevated>
      {hasHead && (
        <UiFlex className={cn(`${BLOCK_NAME}__head`)} justify="between" align="center" gap={12} wrap="wrap">
          {title ? (
            <Typography variant="h2" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
              {title}
            </Typography>
          ) : (
            <div />
          )}
          {headActions && <div className={cn(`${BLOCK_NAME}__extra`)}>{headActions}</div>}
        </UiFlex>
      )}
      <UiFlex direction="column" gap={14} className={cn(`${BLOCK_NAME}__body`)}>
        {children}
      </UiFlex>
    </UiCard>
  )
}
