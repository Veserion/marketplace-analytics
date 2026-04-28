import classNames from 'classnames/bind'
import type { Marketplace } from '@/entities/ozon-report'
import { UiTabs } from '@/shared/ui-kit/tabs'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'MarketplaceTabs'

type MarketplaceTabsProps = {
  activeMarketplace: Marketplace
  onChange: (marketplace: Marketplace) => void
}

export function MarketplaceTabs({ activeMarketplace, onChange }: MarketplaceTabsProps) {
  const items: { key: Marketplace, label: string }[] = [
    { key: 'wildberries', label: 'Wildberries' },
    { key: 'ozon', label: 'Ozon' },
  ]

  return (
    <div className={cn(BLOCK_NAME)}>
      <UiTabs items={items} value={activeMarketplace} onChange={onChange} ariaLabel="Выбор площадки" />
    </div>
  )
}
