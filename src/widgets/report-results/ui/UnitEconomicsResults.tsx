import classNames from 'classnames/bind'
import type { MetricKey, ReportGroup } from '@/entities/ozon-report/model/types'
import { getUnitMetricClassValue, getUnitMetricDisplay } from '@/entities/ozon-report/model/unit-metric-view'
import { Typography } from '@/shared/ui-kit'
import { FormulaTooltipIcon } from '@/shared/ui/formula-tooltip-icon'
import { AvailabilityStockPanel } from '@/widgets/report-results/ui/AvailabilityStockPanel'
import { ProductMarginPanel } from '@/widgets/report-results/ui/ProductMarginPanel'
import styles from './UnitEconomicsResults.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UnitEconomicsResults'

type UnitEconomicsResultsProps = {
  reports: ReportGroup[]
  selectedMetricSet: Set<MetricKey>
}

function getValueClassName(value: number | null): string {
  if (value === null) return cn(`${BLOCK_NAME}__metric-value`)
  if (value > 0) return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--positive`)
  if (value < 0) return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--negative`)
  return cn(`${BLOCK_NAME}__metric-value`)
}

export function UnitEconomicsResults({ reports, selectedMetricSet }: UnitEconomicsResultsProps) {
  return (
    <section className={cn(BLOCK_NAME)}>
      {reports.map((report) => {
        const visibleMetrics = report.metrics.filter((metric) => selectedMetricSet.has(metric.key))
        return (
          <article className={cn(`${BLOCK_NAME}__card`)} key={report.title}>
            <header className={cn(`${BLOCK_NAME}__header`)}>
              <Typography variant="h3" color="accent">{report.title}</Typography>
              <Typography variant="body2" color="muted">Строк товаров: {report.rowCount}</Typography>
            </header>

            <div className={cn(`${BLOCK_NAME}__list`)}>
              {visibleMetrics.map((metric) => {
                const display = getUnitMetricDisplay(metric, report)
                return (
                  <div key={metric.key} className={cn(`${BLOCK_NAME}__row`, `${BLOCK_NAME}__row--with-share`)}>
                    <div className={cn(`${BLOCK_NAME}__metric-title`)}>
                      <Typography as="span" variant="body2" color="accent" semiBold>{metric.label}</Typography>
                      <FormulaTooltipIcon formula={metric.formula} />
                    </div>
                    <Typography
                      as="span"
                      variant="body1"
                      className={getValueClassName(getUnitMetricClassValue(metric))}
                      semiBold
                    >
                      {display.valueText}
                    </Typography>
                    <Typography as="span" variant="body2" color="muted" semiBold className={cn(`${BLOCK_NAME}__metric-share`)}>
                      {display.shareText || ''}
                    </Typography>
                  </div>
                )
              })}
            </div>

            {report.availabilityGroups && (
              <div className={cn(`${BLOCK_NAME}__availability`)}>
                <AvailabilityStockPanel groups={report.availabilityGroups} />
              </div>
            )}

            {report.productMargins && (
              <div className={cn(`${BLOCK_NAME}__product-margin`)}>
                <ProductMarginPanel items={report.productMargins} />
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}
