import classNames from 'classnames/bind'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import { formatValue } from '@/shared/lib/csv'
import { Typography, UiMetricsList } from '@/shared/ui-kit'
import type { UiMetricsListRow } from '@/shared/ui-kit'
import { AccrualCostStructure } from './AccrualCostStructure'
import styles from './AccrualResults.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AccrualResults'
const CANCELLATIONS_AND_RETURNS_LABEL = 'Отмены, возвраты, не выкупы'
const TAX_LABEL = 'Налог'
const COGS_LABEL = 'Себестоимость'
const MARKETPLACE_EXPENSES_LABEL = 'Общие затраты по Маркетплейсу'
const DEFAULT_COGS_MISSING_VALUE_TEXT = 'Нет данных: загрузите "Юнит экономика" за тот же период'
const STRUCTURE_PREFIX = 'Структура: '
const REVENUE_BEFORE_SPP_LABEL = 'Выручка с учетом СПП'
const REVENUE_WITHOUT_SPP_LABEL = 'Выручка без СПП'
const RETURNS_LABEL = 'Возвраты'
const SPP_AND_PROMOTIONS_LABEL = 'СПП и акции'
const TRANSFER_TO_BANK_LABEL = 'Перевод в банк'
const GROUPED_EXPENSES_REPORT_TITLE = 'Общие затраты по Маркетплейсу'
const SALES_GROUP_LABEL = 'Продажи'
const GROUPED_TOTAL_LABEL = 'Итог'
const MAX_OVERVIEW_ITEMS = 8
const FORCED_NEGATIVE_DISPLAY_LABELS = new Set([
  RETURNS_LABEL,
  TAX_LABEL,
  COGS_LABEL,
  MARKETPLACE_EXPENSES_LABEL,
])
const OVERVIEW_COLORS = [
  'var(--color-accent, #12305d)',
  'var(--color-positive, #1f8b4c)',
  '#58b8cf',
  '#e6b766',
  '#9f91d8',
  '#ee8f68',
  '#d96b9f',
  '#7f93ae',
]

type AccrualResultsProps = {
  reports: AccrualGroup[]
  cogsMissingValueText?: string
  showAccrualOverview?: boolean
}

function getValueClassName(value: number | null): string {
  if (value === null) return cn(`${BLOCK_NAME}__metric-value`)
  if (value > 0) return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--positive`)
  if (value < 0) return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--negative`)
  return cn(`${BLOCK_NAME}__metric-value`)
}

function getPrimaryMetricValueClassName(label: string, value: number | null): string {
  if (label === COGS_LABEL && value === null) {
    return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--muted`)
  }
  if (
    label === CANCELLATIONS_AND_RETURNS_LABEL
    || label === TAX_LABEL
    || label === COGS_LABEL
    || label === MARKETPLACE_EXPENSES_LABEL
  ) {
    return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--negative`)
  }
  return getValueClassName(value)
}

function toMetricRow(
  reportTitle: string,
  metric: AccrualGroup['metrics'][number],
  valueClassName: string,
  cogsMissingValueText: string,
  labelColor?: 'accent' | 'muted',
): UiMetricsListRow {
  const shouldForceNegativeInTotals = reportTitle === 'Итоги периода'
    && metric.label !== CANCELLATIONS_AND_RETURNS_LABEL
    && FORCED_NEGATIVE_DISPLAY_LABELS.has(metric.label)
  const normalizedValue = shouldForceNegativeInTotals && metric.value !== null
    ? -Math.abs(metric.value)
    : metric.value
  const valueText = metric.label === COGS_LABEL && metric.value === null
    ? cogsMissingValueText
    : formatValue(normalizedValue, metric.type)

  return {
    id: `${reportTitle}-${metric.label}`,
    label: metric.label,
    formula: metric.formula,
    valueText,
    percentText: metric.shareText,
    valueClassName,
    labelColor,
  }
}

type OverviewItem = {
  label: string
  value: number
  formula: string
  color: string
}

type OverviewModel = {
  salesTotal: AccrualGroup['metrics'][number] | null
  salesItems: OverviewItem[]
  accrualTotal: AccrualGroup['metrics'][number] | null
  accrualItems: OverviewItem[]
  transferTotal: AccrualGroup['metrics'][number] | null
}

function getMetric(report: AccrualGroup | undefined, label: string): AccrualGroup['metrics'][number] | null {
  if (!report) return null
  return report.metrics.find((metric) => metric.label === label) ?? null
}

function getOverviewColor(index: number): string {
  return OVERVIEW_COLORS[index % OVERVIEW_COLORS.length]
}

function buildOverviewModel(reports: AccrualGroup[]): OverviewModel | null {
  const totalsReport = reports.find((report) => report.title === 'Итоги периода')
  const groupedReport = reports.find((report) => report.title === GROUPED_EXPENSES_REPORT_TITLE)
  if (!totalsReport || !groupedReport) return null

  const revenueWithoutSpp = getMetric(totalsReport, REVENUE_WITHOUT_SPP_LABEL)
  const returns = getMetric(totalsReport, RETURNS_LABEL)
  const sppAndPromotions = getMetric(totalsReport, SPP_AND_PROMOTIONS_LABEL)
  const salesTotal = getMetric(totalsReport, REVENUE_BEFORE_SPP_LABEL)
  const accrualTotal = getMetric(totalsReport, MARKETPLACE_EXPENSES_LABEL)
  const transferTotal = getMetric(totalsReport, TRANSFER_TO_BANK_LABEL)

  const salesItems: OverviewItem[] = [revenueWithoutSpp, sppAndPromotions, returns]
    .filter((metric): metric is AccrualGroup['metrics'][number] => Boolean(metric && metric.value !== null))
    .map((metric, index) => ({
      label: metric.label,
      value: metric.value || 0,
      formula: metric.formula,
      color: getOverviewColor(index),
    }))

  const groupedItems = groupedReport.metrics
    .filter((metric) =>
      metric.label !== SALES_GROUP_LABEL
      && metric.label !== RETURNS_LABEL
      && metric.label !== GROUPED_TOTAL_LABEL
      && metric.value !== null)
    .map((metric, index) => ({
      label: metric.label,
      value: metric.value || 0,
      formula: metric.formula,
      color: getOverviewColor(index + 2),
    }))

  const accrualItems = groupedItems.slice(0, MAX_OVERVIEW_ITEMS)
  if (groupedItems.length > MAX_OVERVIEW_ITEMS) {
    const otherSum = groupedItems.slice(MAX_OVERVIEW_ITEMS).reduce((acc, item) => acc + item.value, 0)
    accrualItems.push({
      label: 'Прочие начисления',
      value: otherSum,
      formula: `SUM("Сумма итого, руб."), фильтр: "Группа услуг" != "${SALES_GROUP_LABEL}" и вне топ-${MAX_OVERVIEW_ITEMS}`,
      color: getOverviewColor(MAX_OVERVIEW_ITEMS + 2),
    })
  }

  return {
    salesTotal,
    salesItems,
    accrualTotal,
    accrualItems,
    transferTotal,
  }
}

function getSegmentPercent(value: number, sumAbs: number): number {
  if (sumAbs === 0) return 0
  return (Math.abs(value) / sumAbs) * 100
}

function formatOverviewCurrency(value: number | null): string {
  if (value === null) return formatValue(value, 'currency')
  return formatValue(Math.round(value), 'currency')
}

function normalizeTotalsDisplayValue(label: string, value: number | null): number | null {
  if (value === null) return null
  if (label === CANCELLATIONS_AND_RETURNS_LABEL) return value
  if (FORCED_NEGATIVE_DISPLAY_LABELS.has(label)) return -Math.abs(value)
  return value
}

export function AccrualResults({
  reports,
  cogsMissingValueText = DEFAULT_COGS_MISSING_VALUE_TEXT,
  showAccrualOverview = false,
}: AccrualResultsProps) {
  const structureReports = reports.filter((report) => report.title.startsWith('Структура:'))
  const baseReports = reports.filter((report) => !report.title.startsWith('Структура:'))
  const overviewModel = showAccrualOverview ? buildOverviewModel(reports) : null
  const salesAbsSum = overviewModel
    ? overviewModel.salesItems.reduce((acc, item) => acc + Math.abs(item.value), 0)
    : 0
  const accrualAbsSum = overviewModel
    ? overviewModel.accrualItems.reduce((acc, item) => acc + Math.abs(item.value), 0)
    : 0

  return (
    <section className={cn(BLOCK_NAME)}>
      {overviewModel && (
        <article className={cn(`${BLOCK_NAME}__overview`)}>
          <section className={cn(`${BLOCK_NAME}__overview-column`)}>
            <Typography variant="h2" color="accent">Продажи и возвраты</Typography>
            <Typography
              variant="h2"
              color="primary"
              className={getPrimaryMetricValueClassName(overviewModel.salesTotal?.label || '', overviewModel.salesTotal?.value ?? null)}
            >
              {formatOverviewCurrency(normalizeTotalsDisplayValue(
                overviewModel.salesTotal?.label || '',
                overviewModel.salesTotal?.value ?? null,
              ))}
            </Typography>
            <div className={cn(`${BLOCK_NAME}__overview-bar`)}>
              {overviewModel.salesItems.map((item) => (
                <span
                  key={item.label}
                  className={cn(`${BLOCK_NAME}__overview-bar-segment`)}
                  style={{ width: `${getSegmentPercent(item.value, salesAbsSum)}%`, backgroundColor: item.color }}
                />
              ))}
            </div>
            <ul className={cn(`${BLOCK_NAME}__overview-list`)}>
              {overviewModel.salesItems.map((item) => (
                <li className={cn(`${BLOCK_NAME}__overview-item`)} key={item.label}>
                  <div className={cn(`${BLOCK_NAME}__overview-item-label`)}>
                    <span className={cn(`${BLOCK_NAME}__overview-dot`)} style={{ backgroundColor: item.color }} />
                    <Typography variant="body2" color="primary">{item.label}</Typography>
                  </div>
                  <Typography
                    variant="body2"
                    color="primary"
                    semiBold
                    className={cn(`${BLOCK_NAME}__value-nowrap`)}
                  >
                    {formatOverviewCurrency(normalizeTotalsDisplayValue(item.label, item.value))}
                  </Typography>
                </li>
              ))}
            </ul>
          </section>

          <section className={cn(`${BLOCK_NAME}__overview-column`, `${BLOCK_NAME}__overview-column--wide`)}>
            <Typography variant="h2" color="accent">Расходы по Маркетплейсу</Typography>
            <Typography
              variant="h2"
              color="primary"
              className={getPrimaryMetricValueClassName(overviewModel.accrualTotal?.label || '', overviewModel.accrualTotal?.value ?? null)}
            >
              {formatOverviewCurrency(normalizeTotalsDisplayValue(
                overviewModel.accrualTotal?.label || '',
                overviewModel.accrualTotal?.value ?? null,
              ))}
            </Typography>
            <div className={cn(`${BLOCK_NAME}__overview-bar`)}>
              {overviewModel.accrualItems.map((item) => (
                <span
                  key={item.label}
                  className={cn(`${BLOCK_NAME}__overview-bar-segment`)}
                  style={{ width: `${getSegmentPercent(item.value, accrualAbsSum)}%`, backgroundColor: item.color }}
                />
              ))}
            </div>
            <ul className={cn(`${BLOCK_NAME}__overview-list`, `${BLOCK_NAME}__overview-list--two-columns`)}>
              {overviewModel.accrualItems.map((item) => (
                <li className={cn(`${BLOCK_NAME}__overview-item`)} key={item.label}>
                  <div className={cn(`${BLOCK_NAME}__overview-item-label`)}>
                    <span className={cn(`${BLOCK_NAME}__overview-dot`)} style={{ backgroundColor: item.color }} />
                    <Typography variant="body2" color="primary">{item.label}</Typography>
                  </div>
                  <Typography
                    variant="body2"
                    color="primary"
                    semiBold
                    className={cn(`${BLOCK_NAME}__value-nowrap`)}
                  >
                    {formatOverviewCurrency(item.value)}
                  </Typography>
                </li>
              ))}
            </ul>
          </section>

          <section className={cn(`${BLOCK_NAME}__overview-column`, `${BLOCK_NAME}__overview-column--narrow`)}>
            <Typography variant="h2" color="accent">Перевод в банк</Typography>
            <Typography
              variant="h2"
              color="primary"
              className={getPrimaryMetricValueClassName(overviewModel.transferTotal?.label || '', overviewModel.transferTotal?.value ?? null)}
            >
              {formatOverviewCurrency(normalizeTotalsDisplayValue(
                overviewModel.transferTotal?.label || '',
                overviewModel.transferTotal?.value ?? null,
              ))}
            </Typography>
          </section>
        </article>
      )}

      {showAccrualOverview && <AccrualCostStructure reports={reports} />}

      {baseReports.map((report) => {
        const isWbSalesSchemeReport = report.title === 'Схема работы'
          && report.metrics.some((metric) => metric.label.startsWith('FBS') || metric.label.startsWith('FBW') || metric.label.startsWith('Не указано'))
        const reportTitle = report.title === 'Итоги периода' && report.periodLabel
          ? `${report.title} ${report.periodLabel}`
          : report.title

        return (
          <article className={cn(`${BLOCK_NAME}__card`)} key={report.title}>
            <header className={cn(`${BLOCK_NAME}__header`)}>
              <Typography variant="h3" color="accent">{reportTitle}</Typography>
              {typeof report.rowCount === 'number' && (
                <Typography variant="body2" color="muted">Строк начислений: {report.rowCount}</Typography>
              )}
            </header>

            <UiMetricsList
              hideThirdColumn={isWbSalesSchemeReport}
              rows={report.metrics.map((metric) => (
                toMetricRow(
                  report.title,
                  metric,
                  isWbSalesSchemeReport
                    ? cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--positive`)
                    : getPrimaryMetricValueClassName(metric.label, metric.value),
                  cogsMissingValueText,
                )
              ))}
            />
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
                    toMetricRow(report.title, metric, getValueClassName(metric.value), cogsMissingValueText)
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
