import classNames from 'classnames/bind'
import Button from 'antd/es/button'
import Checkbox from 'antd/es/checkbox'
import { METRICS } from '@/entities/ozon-report'
import type { MetricKey } from '@/entities/ozon-report'
import { UiDisclosure } from '@/shared/ui-kit/disclosure'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './MetricsSelectorPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'MetricsSelectorPanel'

type MetricsSelectorPanelProps = {
  isOpen: boolean
  selectedMetricSet: Set<MetricKey>
  onToggleOpen: () => void
  onToggleMetric: (key: MetricKey) => void
  onSelectAll: () => void
  onClearAll: () => void
}

export function MetricsSelectorPanel({
  isOpen,
  selectedMetricSet,
  onToggleOpen,
  onToggleMetric,
  onSelectAll,
  onClearAll,
}: MetricsSelectorPanelProps) {
  return (
    <UiPanel>
      <UiDisclosure
        title={<Typography as="span" variant="h2" color="accent" bold>Метрики для расчёта</Typography>}
        isOpen={isOpen}
        onToggle={() => onToggleOpen()}
        contentInnerClassName={cn(`${BLOCK_NAME}__content`)}
      >
          <div className={cn(`${BLOCK_NAME}__actions`)}>
            <Button className={cn(`${BLOCK_NAME}__action-button`)} onClick={onSelectAll}>
              Выбрать всё
            </Button>
            <Button className={cn(`${BLOCK_NAME}__action-button`)} onClick={onClearAll}>
              Снять всё
            </Button>
          </div>

          <div className={cn(`${BLOCK_NAME}__grid`)}>
            {METRICS.map((metric) => (
              <Checkbox
                key={metric.key}
                className={cn(`${BLOCK_NAME}__item`)}
                checked={selectedMetricSet.has(metric.key)}
                onChange={() => onToggleMetric(metric.key)}
              >
                <Typography as="span" variant="body2" color="accent">{metric.label}</Typography>
              </Checkbox>
            ))}
          </div>
      </UiDisclosure>
    </UiPanel>
  )
}
