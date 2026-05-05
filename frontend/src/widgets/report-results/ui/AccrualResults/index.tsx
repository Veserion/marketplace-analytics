import classNames from 'classnames/bind'
import Radio from 'antd/es/radio'
import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import { formatValue } from '@/shared/lib/csv'
import { UiAccordion } from '@/shared/ui-kit/accordion'
import { UiMetricsList } from '@/shared/ui-kit/metrics-list'
import type { UiMetricsListRow } from '@/shared/ui-kit/metrics-list'
import { Typography } from '@/shared/ui-kit/typography'
import { AccrualCostStructure } from '../AccrualCostStructure'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AccrualResults'
const CANCELLATIONS_AND_RETURNS_LABEL = 'Отмены, возвраты, не выкупы'
const CANCELLATIONS_AND_NON_PICKUPS_LABEL = 'Отмены и не выкупы'
const TAX_LABEL = 'Налог'
const COGS_LABEL = 'Себестоимость'
const MARKETPLACE_EXPENSES_LABEL = 'Общие затраты по Маркетплейсу'
const DEFAULT_COGS_MISSING_VALUE_TEXT = 'Нет данных: загрузите "Юнит экономика" за тот же период'
const STRUCTURE_PREFIX = 'Структура: '
const REVENUE_WITHOUT_SPP_LABEL = 'Выручка без СПП'
const RETURNS_LABEL = 'Возвраты'
const SPP_AND_PROMOTIONS_LABEL = 'СПП и акции'
const TRANSFER_TO_BANK_LABEL = 'Перевод в банк'
const GROUPED_EXPENSES_REPORT_TITLE = 'Общие затраты по Маркетплейсу'
const SALES_GROUP_LABEL = 'Продажи'
const GROUPED_TOTAL_LABEL = 'Итог'
const GROUPED_SUBTOTAL_LABELS = new Set(['Итого расходов', 'Итого компенсаций', 'Итого с учётом компенсаций'])
const POSITIVE_REVENUE_ADJUSTMENT_LABELS = new Set(['Добровольная компенсация', 'Компенсация скидки'])
const EXPLANATION_REPORT_TITLES = new Set([
  'Итоги периода',
  GROUPED_EXPENSES_REPORT_TITLE,
  'Схема работы',
])
const MAX_OVERVIEW_ITEMS = 8
const FORCED_NEGATIVE_DISPLAY_LABELS = new Set([
  RETURNS_LABEL,
  TAX_LABEL,
  COGS_LABEL,
  MARKETPLACE_EXPENSES_LABEL,
])
const OVERVIEW_COLORS = [
  'var(--color-company',
  '#fcca09',
  '#f55da2',
  '#8c7ed8',
  '#a66401',
  '#f67b48',
  '#028d30',
  '#7f93ae',
]

const DYNAMICS_REPORT_TITLE = 'Динамика по датам начисления'
const compactRubleFormatter = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

type AccrualResultsProps = {
  reports: AccrualGroup[]
  cogsMissingValueText?: string
  showAccrualOverview?: boolean
  isWildberries?: boolean
}

type DynamicsChartPoint = {
  dateLabel: string
  value: number
  valueText: string
  shareText?: string | null
}

type DynamicsViewMode = 'chart' | 'table'
type DateRange = {
  from: number
  to: number
}

const DYNAMICS_VIEW_OPTIONS: Array<{ label: string, value: DynamicsViewMode }> = [
  { label: 'График', value: 'chart' },
  { label: 'Таблица', value: 'table' },
]

function toDateTimestamp(label: string): number | null {
  const normalized = label.trim()
  if (!normalized) return null

  const dotParts = normalized.split('.').map(Number)
  if (dotParts.length === 3 && dotParts.every((part) => !Number.isNaN(part))) {
    const [day, month, year] = dotParts
    const date = new Date(year, month - 1, day)
    const time = date.getTime()
    return Number.isNaN(time) ? null : time
  }

  const dashParts = normalized.split('-').map(Number)
  if (dashParts.length === 3 && dashParts.every((part) => !Number.isNaN(part))) {
    const [year, month, day] = dashParts
    const date = new Date(year, month - 1, day)
    const time = date.getTime()
    return Number.isNaN(time) ? null : time
  }

  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

function parseDateRangeFromPeriodLabel(periodLabel?: string): DateRange | null {
  if (!periodLabel) return null
  const matches = periodLabel.match(/\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{1,2}-\d{1,2}/g) || []
  if (matches.length === 0) return null

  const fromLabel = matches[0]
  const toLabel = matches[matches.length - 1]
  if (!fromLabel || !toLabel) return null

  const from = toDateTimestamp(fromLabel)
  const to = toDateTimestamp(toLabel)
  if (from === null || to === null) return null

  return {
    from: Math.min(from, to),
    to: Math.max(from, to),
  }
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
    || label === CANCELLATIONS_AND_NON_PICKUPS_LABEL
    || label === RETURNS_LABEL
    || label === TAX_LABEL
    || label === COGS_LABEL
    || label === MARKETPLACE_EXPENSES_LABEL
  ) {
    return cn(`${BLOCK_NAME}__metric-value`, `${BLOCK_NAME}__metric-value--negative`)
  }
  return getValueClassName(value)
}

function getMetricExplanation(reportTitle: string, label: string): string | null {
  if (reportTitle.startsWith(STRUCTURE_PREFIX)) {
    return 'Крупная составляющая выбранной категории начислений: показывает, за счет какого типа операции сформировалась сумма.'
  }
  if (!EXPLANATION_REPORT_TITLES.has(reportTitle)) return null

  const explanations: Record<string, string> = {
    'Количество продаж': 'Число проданных товаров за выбранный период.',
    [CANCELLATIONS_AND_RETURNS_LABEL]: 'Количество заказов, которые не дошли до успешной продажи: возвраты, отмены и невыкупы.',
    [CANCELLATIONS_AND_NON_PICKUPS_LABEL]: 'Количество заказов, которые не были выкуплены или были отменены покупателями.',
    [RETURNS_LABEL]: 'Возвраты покупателей: показатель помогает оценить потери оборота и нагрузку на логистику.',
    'Выручка с учетом СПП': 'Оборот продаж с учетом скидок и компенсаций маркетплейса, близкий к полной цене реализации товара.',
    [REVENUE_WITHOUT_SPP_LABEL]: 'Сумма продаж после скидок маркетплейса, которая отражает фактическую цену для покупателя.',
    [SPP_AND_PROMOTIONS_LABEL]: 'Влияние скидок, акций и программ продвижения маркетплейса на цену продажи.',
    [MARKETPLACE_EXPENSES_LABEL]: 'Совокупные удержания маркетплейса за комиссии, логистику, хранение, продвижение и другие услуги.',
    [TRANSFER_TO_BANK_LABEL]: 'Деньги, которые маркетплейс перечисляет продавцу после своих начислений и удержаний.',
    [COGS_LABEL]: 'Закупочная или производственная стоимость проданных товаров.',
    [TAX_LABEL]: 'Оценка налоговой нагрузки по продажам за период.',
    'Маржинальность': 'Доля чистой прибыли в выручке: показывает экономическую эффективность продаж.',
    'Чистая прибыль': 'Оценка результата после расходов маркетплейса, себестоимости и налогов.',
    'Комиссия Ozon': 'Вознаграждение маркетплейса за продажу товара на площадке.',
    'Расходы по Ozon': 'Основные удержания Ozon за обслуживание продаж и выполнение операций на площадке.',
    'Комиссия WB': 'Вознаграждение Wildberries за продажу товара на площадке.',
    'Услуги ФБО': 'Расходы на операции маркетплейса по модели хранения и обработки товаров на стороне площадки.',
    'Логистика': 'Расходы на доставку, перемещение и обработку отправлений.',
    'Продвижение': 'Расходы на рекламные инструменты и платное продвижение товаров внутри маркетплейса.',
    'Услуги партнеров': 'Платные сервисы партнеров маркетплейса, связанные с продажами и операциями.',
    'Другие услуги и штрафы': 'Прочие удержания маркетплейса, включая дополнительные услуги, корректировки и штрафы.',
    'Реклама и удержания': 'Расходы на продвижение и связанные удержания маркетплейса.',
    'Эквайринг и платежи': 'Расходы на прием и обработку платежей покупателей.',
    'Хранение': 'Расходы за размещение товаров на складах маркетплейса.',
    'Штрафы': 'Финансовые санкции маркетплейса за нарушения правил или операционные ошибки.',
    'Приемка': 'Расходы на приемку и обработку товаров на стороне маркетплейса.',
    'Добровольная компенсация': 'Компенсация от маркетплейса, которая уменьшает общий эффект расходов.',
    'Компенсация скидки': 'Возмещение скидок или акций со стороны маркетплейса.',
    'Итого расходов': 'Суммарный объем расходов маркетплейса до учета компенсаций.',
    'Итого компенсаций': 'Суммарные компенсации, которые уменьшают итоговую нагрузку расходов.',
    'Итого с учётом компенсаций': 'Итоговый эффект расходов маркетплейса после учета компенсаций.',
    'Итог': 'Суммарный результат по категориям внутри блока.',
  }

  if (label.startsWith('FBS') || label.startsWith('FBW') || label.startsWith('FBM')) {
    return 'Доля продаж или выплат по выбранной схеме работы с маркетплейсом.'
  }
  if (label === 'Не указано') {
    return 'Операции, для которых схема работы не была определена в данных отчета.'
  }
  return explanations[label] ?? 'Показатель отражает отдельную категорию начислений или удержаний маркетплейса за выбранный период.'
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
    && metric.label !== CANCELLATIONS_AND_NON_PICKUPS_LABEL
    && metric.type !== 'number'
    && metric.type !== 'count'
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
    formula: getMetricExplanation(reportTitle, metric.label) ?? metric.formula,
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
  salesTotalValue: number
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
  const sppAndPromotions = getMetric(totalsReport, SPP_AND_PROMOTIONS_LABEL)
  const transferTotal = getMetric(totalsReport, TRANSFER_TO_BANK_LABEL)

  const sppAndPromotionsValue = sppAndPromotions?.value || 0
  const revenueWithoutSppValue = revenueWithoutSpp?.value || 0
  const salesTotalValue = revenueWithoutSppValue + sppAndPromotionsValue

  const baseSalesItems: OverviewItem[] = [
    {
      label: REVENUE_WITHOUT_SPP_LABEL,
      value: revenueWithoutSppValue,
      formula: revenueWithoutSpp?.formula ?? REVENUE_WITHOUT_SPP_LABEL,
      color: getOverviewColor(0),
    },
    {
      label: SPP_AND_PROMOTIONS_LABEL,
      value: sppAndPromotionsValue,
      formula: sppAndPromotions?.formula ?? SPP_AND_PROMOTIONS_LABEL,
      color: getOverviewColor(1),
    },
  ]

  const salesItems: OverviewItem[] = baseSalesItems

  const groupedItems = groupedReport.metrics
    .filter((metric) =>
      metric.label !== SALES_GROUP_LABEL
      && metric.label !== RETURNS_LABEL
      && metric.label !== GROUPED_TOTAL_LABEL
      && !GROUPED_SUBTOTAL_LABELS.has(metric.label)
      && metric.value !== null)
    .map((metric, index) => {
      const isCompensation = POSITIVE_REVENUE_ADJUSTMENT_LABELS.has(metric.label)
      return {
        label: metric.label,
        value: isCompensation ? Math.abs(metric.value || 0) : -Math.abs(metric.value || 0),
        formula: metric.formula,
        color: getOverviewColor(index + 2),
      }
    })

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

  const accrualTotalValue = accrualItems.reduce((sum, item) => sum + item.value, 0)
  const accrualTotal: AccrualGroup['metrics'][number] = {
    label: MARKETPLACE_EXPENSES_LABEL,
    value: accrualTotalValue,
    type: 'currency',
    formula: `Сумма статей расходов и компенсаций`,
  }

  return {
    salesTotalValue,
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
  if (label === CANCELLATIONS_AND_NON_PICKUPS_LABEL) return value
  if (FORCED_NEGATIVE_DISPLAY_LABELS.has(label)) return -Math.abs(value)
  return value
}

function formatCompactRuble(value: number): string {
  return `${compactRubleFormatter.format(value)} ₽`
}

export function AccrualResults({
  reports,
  cogsMissingValueText = DEFAULT_COGS_MISSING_VALUE_TEXT,
  showAccrualOverview = false,
  isWildberries = false,
}: AccrualResultsProps) {
  const [dynamicsViewMode, setDynamicsViewMode] = useState<DynamicsViewMode>('chart')
  const structureReports = reports.filter((report) => report.title.startsWith('Структура:'))
  const baseReports = reports.filter((report) => !report.title.startsWith('Структура:'))
  const totalsReport = baseReports.find((report) => report.title === 'Итоги периода')
  const wildberriesPeriodRange = isWildberries
    ? parseDateRangeFromPeriodLabel(totalsReport?.periodLabel)
    : null
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
              className={getValueClassName(overviewModel.salesTotalValue)}
            >
              {formatOverviewCurrency(overviewModel.salesTotalValue)}
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
          && report.metrics.some((metric) => metric.label.startsWith('FBS') || metric.label.startsWith('FBW') || metric.label.startsWith('FBM') || metric.label.startsWith('Не указано'))
        const isAccrualDynamicsReport = report.title === DYNAMICS_REPORT_TITLE
        const reportTitle = report.title === 'Итоги периода' && report.periodLabel
          ? `${report.title} ${report.periodLabel}`
          : report.title
        const dynamicsChartData: DynamicsChartPoint[] = isAccrualDynamicsReport
          ? report.metrics
            .filter((metric): metric is typeof metric & { value: number } => metric.value !== null)
            .map((metric) => ({
              dateLabel: metric.label,
              value: metric.value,
              valueText: formatValue(metric.value, metric.type),
              shareText: metric.shareText,
            }))
          : []
        const filteredDynamicsChartData = isWildberries && wildberriesPeriodRange
          ? dynamicsChartData.filter((point) => {
            const timestamp = toDateTimestamp(point.dateLabel)
            return timestamp !== null
              && timestamp >= wildberriesPeriodRange.from
              && timestamp <= wildberriesPeriodRange.to
          })
          : dynamicsChartData
        const dynamicsTotalValue = filteredDynamicsChartData.reduce((sum, point) => sum + point.value, 0)

        return (
          <article className={cn(`${BLOCK_NAME}__card`)} key={report.title}>
            <header className={cn(`${BLOCK_NAME}__header`)}>
              <Typography variant="h3" color="accent">{reportTitle}</Typography>
              {typeof report.rowCount === 'number' && (
                <Typography variant="body2" color="muted">Строк начислений: {report.rowCount}</Typography>
              )}
            </header>

            {isAccrualDynamicsReport ? (
              <div className={cn(`${BLOCK_NAME}__dynamics`)}>
                <Radio.Group
                  block
                  className={cn(`${BLOCK_NAME}__dynamics-view-switch`)}
                  options={DYNAMICS_VIEW_OPTIONS}
                  optionType="button"
                  value={dynamicsViewMode}
                  onChange={(event) => setDynamicsViewMode(event.target.value as DynamicsViewMode)}
                />

                {dynamicsViewMode === 'chart' ? (
                  <div className={cn(`${BLOCK_NAME}__dynamics-chart`)}>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart
                        data={filteredDynamicsChartData}
                        margin={{ top: 8, right: 12, left: 0, bottom: 6 }}
                      >
                        <CartesianGrid stroke="var(--color-border-subtle)" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="dateLabel"
                          minTickGap={24}
                          tickLine={false}
                          axisLine={{ stroke: 'var(--color-border-subtle)' }}
                          tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                        />
                        <YAxis
                          tickFormatter={formatCompactRuble}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                          width={72}
                        />
                        <ReferenceLine y={0} stroke="var(--color-border-muted)" />
                        <RechartsTooltip
                          cursor={{ stroke: 'var(--color-border-muted)' }}
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null
                            const point = payload[0]?.payload as DynamicsChartPoint | undefined
                            if (!point) return null

                            return (
                              <div className={cn(`${BLOCK_NAME}__dynamics-tooltip`)}>
                                <Typography variant="body3" color="accent" semiBold>{point.dateLabel}</Typography>
                                <Typography
                                  variant="body3"
                                  color="primary"
                                  className={cn({
                                    [`${BLOCK_NAME}__dynamics-tooltip-value--positive`]: point.value > 0,
                                    [`${BLOCK_NAME}__dynamics-tooltip-value--negative`]: point.value < 0,
                                  })}
                                >
                                  {point.valueText}
                                </Typography>
                                {point.shareText && (
                                  <Typography variant="caption" color="muted">{point.shareText}</Typography>
                                )}
                              </div>
                            )
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="var(--color-positive, #1f8b4c)"
                          strokeWidth={3.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <Typography variant="body2" color="accent" semiBold className={cn(`${BLOCK_NAME}__dynamics-total`)}>
                      Итого: {formatValue(dynamicsTotalValue, 'currency')}
                    </Typography>
                  </div>
                ) : (
                  <UiMetricsList
                    rows={report.metrics.map((metric) => {
                      const row = toMetricRow(report.title, metric, getValueClassName(metric.value), cogsMissingValueText)
                      return { ...row, formula: undefined }
                    })}
                  />
                )}
              </div>
            ) : (
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
            )}
          </article>
        )
      })}

      {structureReports.length > 0 && (
        <UiAccordion
          title={(
            <Typography as="span" variant="h3" color="accent">
              Сруктура расчета
            </Typography>
          )}
        >
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
        </UiAccordion>
      )}
    </section>
  )
}
