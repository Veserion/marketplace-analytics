import type { AccrualGroup } from '../types/reports'
import { formatValue } from '../utils/csv'
import { FormulaTooltipIcon } from './FormulaTooltipIcon'

type AccrualResultsProps = {
  reports: AccrualGroup[]
  getMetricValueClassName: (value: number | null) => string
}

export function AccrualResults({ reports, getMetricValueClassName }: AccrualResultsProps) {
  return (
    <section className="reports">
      {reports.map((report) => (
        <article className="report-card" key={report.title}>
          <header>
            <h3>{report.title}</h3>
            {typeof report.rowCount === 'number' && <p>Строк начислений: {report.rowCount}</p>}
          </header>

          <div className="result-list">
            {report.metrics.map((metric) => (
              <div key={`${report.title}-${metric.label}`} className="result-row result-row-compact">
                <p className="metric-title">
                  {metric.label}
                  <FormulaTooltipIcon formula={metric.formula} />
                </p>
                <p className={getMetricValueClassName(metric.value)}>{formatValue(metric.value, metric.type)}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}
