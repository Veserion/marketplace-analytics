import classNames from 'classnames/bind'
import { METRICS } from '@/entities/ozon-report'
import type { MetricKey } from '@/entities/ozon-report'
import { Typography, UiDisclosure, UiPanel } from '@/shared/ui-kit'
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
    <UiPanel className={cn(BLOCK_NAME)}>
      <UiDisclosure
        title={<Typography as="span" variant="h2" color="accent" bold>Метрики для расчёта</Typography>}
        isOpen={isOpen}
        onToggle={() => onToggleOpen()}
        triggerClassName={cn(`${BLOCK_NAME}__trigger`)}
        chevronClassName={cn(`${BLOCK_NAME}__chevron`)}
        contentInnerClassName={cn(`${BLOCK_NAME}__content`)}
      >
          <div className={cn(`${BLOCK_NAME}__actions`)}>
            <button type="button" className={cn(`${BLOCK_NAME}__action-button`)} onClick={onSelectAll}>
              <Typography as="span" variant="body2" color="accent">Выбрать всё</Typography>
            </button>
            <button type="button" className={cn(`${BLOCK_NAME}__action-button`)} onClick={onClearAll}>
              <Typography as="span" variant="body2" color="accent">Снять всё</Typography>
            </button>
          </div>

          <div className={cn(`${BLOCK_NAME}__grid`)}>
            {METRICS.map((metric) => (
              <label key={metric.key} className={cn(`${BLOCK_NAME}__item`)}>
                <input type="checkbox" checked={selectedMetricSet.has(metric.key)} onChange={() => onToggleMetric(metric.key)} />
                <Typography as="span" variant="body2" color="accent">{metric.label}</Typography>
              </label>
            ))}
          </div>
      </UiDisclosure>
    </UiPanel>
  )
}
