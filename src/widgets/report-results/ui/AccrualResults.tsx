import classNames from 'classnames/bind'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import { formatValue } from '@/shared/lib/csv'
import { Typography } from '@/shared/ui-kit'
import { FormulaTooltipIcon } from '@/shared/ui/formula-tooltip-icon'
import styles from './AccrualResults.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AccrualResults'

type AccrualResultsProps = {
  reports: AccrualGroup[]
}

function getValueClassName(value: number | null): string {
  if (value === null) return cn(`${BLOCK_NAME}__metric-value`)
  if (value > 0) return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--positive`)
  if (value < 0) return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--negative`)
  return cn(`${BLOCK_NAME}__metric-value`)
}

export function AccrualResults({ reports }: AccrualResultsProps) {
  return (
    <section className={cn(BLOCK_NAME)}>
      {reports.map((report) => (
        <article className={cn(`${BLOCK_NAME}__card`)} key={report.title}>
          <header className={cn(`${BLOCK_NAME}__header`)}>
            <Typography variant="h3" color="accent">{report.title}</Typography>
            {typeof report.rowCount === 'number' && (
              <Typography variant="body2" color="muted">Строк начислений: {report.rowCount}</Typography>
            )}
          </header>

          <div className={cn(`${BLOCK_NAME}__list`)}>
            {report.metrics.map((metric) => (
              <div key={`${report.title}-${metric.label}`} className={cn(`${BLOCK_NAME}__row`)}>
                <div className={cn(`${BLOCK_NAME}__metric-title`)}>
                  <Typography as="span" variant="body2" color="accent" semiBold>{metric.label}</Typography>
                  <FormulaTooltipIcon formula={metric.formula} />
                </div>
                <Typography as="span" variant="body1" semiBold className={getValueClassName(metric.value)}>
                  {formatValue(metric.value, metric.type)}
                </Typography>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}
