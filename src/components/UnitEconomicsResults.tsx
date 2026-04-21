import type { MetricKey, ReportGroup } from '../types/reports'
import { formatValue } from '../utils/csv'
import { FormulaTooltipIcon } from './FormulaTooltipIcon'

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
              {visibleMetrics.map((metric) => (
                <div key={metric.key} className="result-row">
                  <p className="metric-title">
                    {metric.label}
                    <FormulaTooltipIcon formula={metric.formula} />
                  </p>
                  <p className={getMetricValueClassName(metric.ok ? metric.value : null)}>
                    {metric.ok ? formatValue(metric.value, metric.type) : 'нет данных'}
                  </p>
                </div>
              ))}
            </div>
          </article>
        )
      })}
    </section>
  )
}
