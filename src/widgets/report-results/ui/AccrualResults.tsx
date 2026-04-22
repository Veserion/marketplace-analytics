import classNames from 'classnames/bind'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import { formatValue } from '@/shared/lib/csv'
import { Typography, UiMetricsList } from '@/shared/ui-kit'
import type { UiMetricsListRow } from '@/shared/ui-kit'
import styles from './AccrualResults.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AccrualResults'
const SECONDARY_INFO_LABELS = new Set(['Строк с плюсами', 'Строк с минусами', 'Строк с нулем'])
const AVERAGE_LABEL = 'Среднее начисление на строку'
const STRUCTURE_PREFIX = 'Структура: '

type AccrualResultsProps = {
  reports: AccrualGroup[]
}

function getValueClassName(value: number | null): string {
  if (value === null) return cn(`${BLOCK_NAME}__metric-value`)
  if (value > 0) return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--positive`)
  if (value < 0) return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--negative`)
  return cn(`${BLOCK_NAME}__metric-value`)
}

function isSecondaryMetric(label: string): boolean {
  return SECONDARY_INFO_LABELS.has(label)
}

function getPrimaryMetricValueClassName(label: string, value: number | null): string {
  if (label === AVERAGE_LABEL) {
    return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--muted`)
  }
  return getValueClassName(value)
}

function toMetricRow(reportTitle: string, metric: AccrualGroup['metrics'][number], valueClassName: string, labelColor?: 'accent' | 'muted'): UiMetricsListRow {
  return {
    id: `${reportTitle}-${metric.label}`,
    label: metric.label,
    formula: metric.formula,
    valueText: formatValue(metric.value, metric.type),
    percentText: metric.shareText,
    valueClassName,
    labelColor,
  }
}

export function AccrualResults({ reports }: AccrualResultsProps) {
  const structureReports = reports.filter((report) => report.title.startsWith('Структура:'))
  const baseReports = reports.filter((report) => !report.title.startsWith('Структура:'))

  return (
    <section className={cn(BLOCK_NAME)}>
      {baseReports.map((report) => {
        const primaryMetrics = report.metrics.filter((metric) => !isSecondaryMetric(metric.label))
        const secondaryMetrics = report.metrics.filter((metric) => isSecondaryMetric(metric.label))
        const showSecondary = report.title === 'Итоги периода' && secondaryMetrics.length > 0

        return (
          <article className={cn(`${BLOCK_NAME}__card`)} key={report.title}>
            <header className={cn(`${BLOCK_NAME}__header`)}>
              <Typography variant="h3" color="accent">{report.title}</Typography>
              {typeof report.rowCount === 'number' && (
                <Typography variant="body2" color="muted">Строк начислений: {report.rowCount}</Typography>
              )}
            </header>

            <UiMetricsList
              rows={primaryMetrics.map((metric) => (
                toMetricRow(report.title, metric, getPrimaryMetricValueClassName(metric.label, metric.value))
              ))}
            />

            {showSecondary && (
              <details className={cn(`${BLOCK_NAME}__secondary-details`)}>
                <summary className={cn(`${BLOCK_NAME}__secondary-summary`)}>
                  <Typography as="span" variant="body2" color="muted" semiBold>
                    Дополнительная информация
                  </Typography>
                </summary>
                <UiMetricsList
                  className={cn(`${BLOCK_NAME}__list--secondary`)}
                  rows={secondaryMetrics.map((metric) => (
                    toMetricRow(
                      `${report.title}-secondary`,
                      metric,
                      cn(`${BLOCK_NAME}__metric-value`),
                      'muted',
                    )
                  ))}
                />
              </details>
            )}
          </article>
        )
      })}

      {structureReports.length > 0 && (
        <details className={cn(`${BLOCK_NAME}__structure-details`)}>
          <summary className={cn(`${BLOCK_NAME}__structure-summary`)}>
                  <Typography as="span" variant="h3" color="accent">
              Сруктура расчета
            </Typography>
          </summary>
          <div className={cn(`${BLOCK_NAME}__structure-list`)}>
            {structureReports.map((report) => (
              <section key={report.title} className={cn(`${BLOCK_NAME}__structure-item`)}>
                <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__structure-item-title`)}>
                  {report.title.startsWith(STRUCTURE_PREFIX) ? report.title.slice(STRUCTURE_PREFIX.length) : report.title}
                </Typography>
                <UiMetricsList
                  rows={report.metrics.map((metric) => (
                    toMetricRow(report.title, metric, getValueClassName(metric.value))
                  ))}
                />
              </section>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
