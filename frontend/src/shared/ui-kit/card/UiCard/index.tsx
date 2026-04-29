import type { HTMLAttributes, ReactNode } from 'react'
import classNames from 'classnames/bind'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiCard'

type UiCardPadding = 'sm' | 'md'

type UiCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  padding?: UiCardPadding
  elevated?: boolean
}

export function UiCard({
  children,
  className,
  padding = 'md',
  elevated = false,
  ...props
}: UiCardProps) {
  return (
    <div
      className={cn(
        BLOCK_NAME,
        `${BLOCK_NAME}--padding-${padding}`,
        elevated && `${BLOCK_NAME}--elevated`,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
