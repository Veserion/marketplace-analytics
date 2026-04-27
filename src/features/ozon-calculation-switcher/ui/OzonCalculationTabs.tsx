import classNames from 'classnames/bind'
import type { OzonCalculationType } from '@/entities/ozon-report'
import { UiTabs } from '@/shared/ui-kit'
import styles from './OzonCalculationTabs.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'OzonCalculationTabs'

type OzonCalculationTabsProps = {
  value: OzonCalculationType
  onChange: (value: OzonCalculationType) => void
}

export function OzonCalculationTabs({ value, onChange }: OzonCalculationTabsProps) {
  const items: { key: OzonCalculationType, label: string }[] = [
    { key: 'unitEconomics', label: 'Юнит экономика' },
    { key: 'accrualReport', label: 'Отчет по начислениям' },
  ]

  return (
    <div className={cn(BLOCK_NAME)}>
      <UiTabs items={items} value={value} onChange={onChange} ariaLabel="Вариант расчёта для Ozon" />
    </div>
  )
}
