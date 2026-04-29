import classNames from 'classnames/bind'
import type { Marketplace } from '@/entities/ozon-report'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'MarketplaceNav'

type MarketplaceNavProps = {
  activeMarketplace: Marketplace
  onChange: (marketplace: Marketplace) => void
}

const ITEMS: { key: Marketplace, label: string }[] = [
  { key: 'ozon', label: 'Ozon' },
  { key: 'wildberries', label: 'Wildberries' },
]

export function MarketplaceNav({ activeMarketplace, onChange }: MarketplaceNavProps) {
  return (
    <nav className={cn(BLOCK_NAME)} aria-label="Навигация по маркетплейсам">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={cn(`${BLOCK_NAME}__button`, {
            [`${BLOCK_NAME}__button--active`]: activeMarketplace === item.key,
            [`${BLOCK_NAME}__button--ozon`]: item.key === 'ozon',
            [`${BLOCK_NAME}__button--wildberries`]: item.key === 'wildberries',
          })}
          onClick={() => onChange(item.key)}
        >
          <span className={cn(`${BLOCK_NAME}__label`)}>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
