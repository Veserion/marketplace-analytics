import classNames from 'classnames/bind'
import type { CSSProperties } from 'react'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiTabs'

type TabItem<T extends string> = {
  key: T
  label: string
}

type UiTabsProps<T extends string> = {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function UiTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = '',
}: UiTabsProps<T>) {
  const style = { '--ui-tabs-count': items.length } as CSSProperties

  return (
    <section className={cn(BLOCK_NAME, className)} aria-label={ariaLabel} style={style}>
      {items.map((item) => (
        <button
          key={item.key}
          className={cn(`${BLOCK_NAME}__button`, {
            [`${BLOCK_NAME}__button--active`]: value === item.key,
          })}
          onClick={() => onChange(item.key)}
          type="button"
        >
          <Typography as="span" variant="body1" semiBold color={value === item.key ? 'light' : 'accent'}>
            {item.label}
          </Typography>
        </button>
      ))}
    </section>
  )
}
