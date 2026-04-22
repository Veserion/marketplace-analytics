import classNames from 'classnames/bind'
import { useNavigate } from 'react-router-dom'
import { MarketplaceTabs } from '@/features/marketplace-switcher'
import { Typography, UiPanel } from '@/shared/ui-kit'
import styles from './WildberriesPage.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'WildberriesPage'

export function WildberriesPage() {
  const navigate = useNavigate()

  const onSwitchMarketplace = (marketplace: 'wildberries' | 'ozon'): void => {
    navigate(marketplace === 'wildberries' ? '/wildberries' : '/ozon')
  }

  return (
    <main className={cn(BLOCK_NAME)}>
      <header className={cn(`${BLOCK_NAME}__hero`)}>
        <Typography variant="caption" color="light" className={cn(`${BLOCK_NAME}__eyebrow`)}>
          Marketplace Analytics
        </Typography>
        <Typography variant="h1" color="light">Аналитика Wildberries</Typography>
        <Typography variant="body1" color="light" className={cn(`${BLOCK_NAME}__subtitle`)}>
          Для Wildberries используется отдельная модель данных и отдельный набор отчетов.
        </Typography>
      </header>

      <MarketplaceTabs activeMarketplace="wildberries" onChange={onSwitchMarketplace} />

      <UiPanel title="Wildberries">
        <Typography variant="body2" color="accent">
          Это отдельная верхнеуровневая фича. Здесь будет свой пайплайн загрузки, расчета и визуализации отчетов.
        </Typography>
      </UiPanel>
    </main>
  )
}
