import type { MetricKey, ReportGroup } from '../types/reports'
import { getUnitMetricClassValue, getUnitMetricDisplay } from '../features/ozon/unitMetricView'
import { AvailabilityStockPanel } from './AvailabilityStockPanel'
import { FormulaTooltipIcon } from './FormulaTooltipIcon'
import { ProductMarginPanel } from './ProductMarginPanel'

type UnitEconomicsResultsProps = {
  reports: ReportGroup[]
  selectedMetricSet: Set<MetricKey>
  getMetricValueClassName: (value: number | null) => string
}

export function UnitEconomicsResults({
  reports,
  selectedMetricSet,
  getMetricValueClassName,
}: UnitEconomicsResultsProps) {
  return (
    <section className="reports">
      {reports.map((report) => {
        const visibleMetrics = report.metrics.filter((metric) => selectedMetricSet.has(metric.key))
        return (
          <article className="report-card" key={report.title}>
            <header>
              <h3>{report.title}</h3>
              <p>Строк товаров: {report.rowCount}</p>
            </header>

            <div className="result-list">
              {visibleMetrics.map((metric) => {
                const display = getUnitMetricDisplay(metric, report)
                return (
                  <div key={metric.key} className="result-row result-row-with-share">
                    <p className="metric-title">
                      {metric.label}
                      <FormulaTooltipIcon formula={metric.formula} />
                    </p>
                    <p className={getMetricValueClassName(getUnitMetricClassValue(metric))}>
                      {display.valueText}
                    </p>
                    <p className="metric-share">{display.shareText || ''}</p>
                  </div>
                )
              })}
            </div>

            {report.availabilityGroups && (
              <div className="report-availability-block">
                <AvailabilityStockPanel groups={report.availabilityGroups} />
              </div>
            )}

            {report.productMargins && (
              <div className="report-product-margin-block">
                <ProductMarginPanel items={report.productMargins} />
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}
