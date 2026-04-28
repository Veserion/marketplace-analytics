import classNames from 'classnames/bind'
import type { MetricKey, ReportGroup } from '@/entities/ozon-report/model/types'
import { getUnitMetricClassValue, getUnitMetricDisplay } from '@/entities/ozon-report/model/unit-metric-view'
import { Typography, UiMetricsList } from '@/shared/ui-kit'
import type { UiMetricsListRow } from '@/shared/ui-kit'
import { AvailabilityStockPanel } from '@/widgets/report-results/ui/AvailabilityStockPanel'
import { ProductMarginPanel } from '@/widgets/report-results/ui/ProductMarginPanel'
import styles from './index.module.scss'

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

            <UiMetricsList
              rows={visibleMetrics.map<UiMetricsListRow>((metric) => {
                const display = getUnitMetricDisplay(metric, report)
                return {
                  id: metric.key,
                  label: metric.label,
                  formula: metric.formula,
                  valueText: display.valueText,
                  percentText: display.shareText,
                  valueClassName: getValueClassName(getUnitMetricClassValue(metric)),
                }
              })}
            />

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
