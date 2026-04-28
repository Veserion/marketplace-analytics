import classNames from 'classnames/bind'
import Segmented from 'antd/es/segmented'
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
}

export function UiTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: UiTabsProps<T>) {
  return (
    <Segmented<T>
      block
      className={cn(BLOCK_NAME)}
      aria-label={ariaLabel}
      value={value}
      onChange={(nextValue) => onChange(nextValue)}
      options={items.map((item) => ({
        label: (
          <Typography as="span" variant="body1" semiBold color={value === item.key ? 'light' : 'accent'}>
            {item.label}
          </Typography>
        ),
        value: item.key,
      }))}
    />
  )
}
