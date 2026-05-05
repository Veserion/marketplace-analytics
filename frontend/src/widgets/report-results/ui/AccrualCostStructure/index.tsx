import classNames from 'classnames/bind'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import { formatValue } from '@/shared/lib/csv'
import { InfoTooltip } from '@/shared/ui-kit/tooltip'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AccrualCostStructure'
const REVENUE_BEFORE_SPP_LABEL = 'Выручка с учетом СПП'
const RETURNS_LABEL = 'Возвраты'
const TAX_LABEL = 'Налог'
const COGS_LABEL = 'Себестоимость'
const GROUPED_EXPENSES_REPORT_TITLE = 'Общие затраты по Маркетплейсу'
const PROMOTION_LABEL = 'Продвижение'
const COMMISSION_OZON_SOURCE_LABEL = 'Комиссия Ozon'
const COMMISSION_OZON_DISPLAY_LABEL = 'Расходы по Ozon'
const FBO_SERVICES_LABEL = 'Услуги ФБО'
const LOGISTICS_LABEL = 'Логистика'
const PARTNER_SERVICES_LABEL = 'Услуги партнеров'
const OTHER_SERVICES_LABEL = 'Другие услуги и штрафы'
const NET_PROFIT_LABEL = 'Чистая прибыль'
const WB_SALES_AND_RETURNS_GROUP_LABEL = 'Продажи и возвраты'
const WB_SALES_GROUP_LABEL = 'Продажи'
const GROUPED_TOTAL_LABEL = 'Итог'
const GROUPED_SUBTOTAL_LABELS = new Set(['Итого расходов', 'Итого компенсаций', 'Итого с учётом компенсаций'])
const WB_OTHER_EXPENSES_LABEL = 'Прочие расходы WB'
const COST_STRUCTURE_COLORS = {
  commission: '#005bff',
  promotion: '#e85a9b',
  logistic: '#daec47',
  returns: '#fd743d',
  tax: '#a66401',
  cogs: '#ae9fff',
  netProfit: '#028d30',
}
const WB_EXPENSE_PALETTE = ['#2d79d5', '#f51c37', '#ff52d7', '#5fa9d7', '#d9b15e', '#f08359']
const WB_MAX_GROUP_SEGMENTS = 5

type CostStructureSegment = {
  key: string
  label: string
  value: number
  color: string
  hint: string
}

type CostStructureModel = {
  baseValue: number
  segments: CostStructureSegment[]
}

type RechartsPayload = {
  payload: CostStructureSegment
}

type RechartsTooltipProps = {
  active?: boolean
  payload?: RechartsPayload[]
}

type AccrualCostStructureProps = {
  reports: AccrualGroup[]
}

function getMetric(report: AccrualGroup | undefined, label: string): AccrualGroup['metrics'][number] | null {
  if (!report) return null
  return report.metrics.find((metric) => metric.label === label) ?? null
}

function getMetricValue(report: AccrualGroup | undefined, label: string): number {
  return getMetric(report, label)?.value ?? 0
}

function getCostStructureExplanation(label: string): string {
  const explanations: Record<string, string> = {
    [COMMISSION_OZON_DISPLAY_LABEL]: 'Основные удержания Ozon за обслуживание продаж и операции на площадке.',
    [LOGISTICS_LABEL]: 'Расходы на доставку, перемещение и обработку отправлений.',
    [PROMOTION_LABEL]: 'Расходы на рекламные инструменты и платное продвижение товаров внутри маркетплейса.',
    [RETURNS_LABEL]: 'Возвраты покупателей: показатель помогает оценить потери оборота и нагрузку на логистику.',
    [TAX_LABEL]: 'Оценка налоговой нагрузки по продажам за период.',
    [COGS_LABEL]: 'Закупочная или производственная стоимость проданных товаров.',
    [NET_PROFIT_LABEL]: 'Оценка результата после расходов маркетплейса, себестоимости и налогов.',
    [WB_OTHER_EXPENSES_LABEL]: 'Сумма менее крупных расходов маркетплейса, объединенных для компактного отображения.',
  }
  return explanations[label] ?? 'Расход маркетплейса, который уменьшает итоговый финансовый результат продавца.'
}

function getSegmentOrderGroup(segment: CostStructureSegment): number {
  if (segment.label === NET_PROFIT_LABEL) return 3
  if (segment.label === TAX_LABEL) return 2
  if (segment.label === COGS_LABEL) return 1
  return 0
}

function sortCostStructureSegments(segments: CostStructureSegment[]): CostStructureSegment[] {
  return [...segments].sort((a, b) => {
    const groupDiff = getSegmentOrderGroup(a) - getSegmentOrderGroup(b)
    if (groupDiff !== 0) return groupDiff
    return b.value - a.value
  })
}

function buildCostStructureModel(reports: AccrualGroup[]): CostStructureModel | null {
  const totalsReport = reports.find((report) => report.title === 'Итоги периода')
  const groupedReport = reports.find((report) => report.title === GROUPED_EXPENSES_REPORT_TITLE)
  if (!totalsReport || !groupedReport) return null

  const isOzonAccrual = groupedReport.metrics.some((metric) => metric.label === COMMISSION_OZON_SOURCE_LABEL)
  if (!isOzonAccrual) {
    return buildWildberriesCostStructureModel(totalsReport, groupedReport)
  }

  const baseValue = Math.max(getMetricValue(totalsReport, REVENUE_BEFORE_SPP_LABEL), 0)
  const returnsValue = Math.abs(getMetricValue(totalsReport, RETURNS_LABEL))
  if (baseValue <= 0) return null

  const commissionComponents = [
    COMMISSION_OZON_SOURCE_LABEL,
    FBO_SERVICES_LABEL,
    PARTNER_SERVICES_LABEL,
    OTHER_SERVICES_LABEL,
  ]
  const groupedValue = (label: string): number => getMetricValue(groupedReport, label)
  const commissionValue = commissionComponents.reduce((acc, label) => acc + Math.abs(groupedValue(label)), 0)
  const logisticValue = Math.abs(groupedValue(LOGISTICS_LABEL))
  const promotionValue = Math.abs(groupedValue(PROMOTION_LABEL))
  const taxValue = Math.abs(getMetricValue(totalsReport, TAX_LABEL))
  const cogsValue = Math.abs(getMetricValue(totalsReport, COGS_LABEL))
  const netProfitValue = Math.max(baseValue - (commissionValue + promotionValue + returnsValue + taxValue + cogsValue), 0)

  const expenseSegments: CostStructureSegment[] = sortCostStructureSegments([
    {
      key: 'commission',
      label: COMMISSION_OZON_DISPLAY_LABEL,
      value: commissionValue,
      color: COST_STRUCTURE_COLORS.commission,
      hint: getCostStructureExplanation(COMMISSION_OZON_DISPLAY_LABEL),
    },
    {
      key: 'commission',
      label: LOGISTICS_LABEL,
      value: logisticValue,
      color: COST_STRUCTURE_COLORS.logistic,
      hint: getCostStructureExplanation(LOGISTICS_LABEL),
    },
    {
      key: 'promotion',
      label: PROMOTION_LABEL,
      value: promotionValue,
      color: COST_STRUCTURE_COLORS.promotion,
      hint: getCostStructureExplanation(PROMOTION_LABEL),
    },
    {
      key: 'returns',
      label: RETURNS_LABEL,
      value: returnsValue,
      color: COST_STRUCTURE_COLORS.returns,
      hint: getCostStructureExplanation(RETURNS_LABEL),
    },
    {
      key: 'tax',
      label: TAX_LABEL,
      value: taxValue,
      color: COST_STRUCTURE_COLORS.tax,
      hint: getCostStructureExplanation(TAX_LABEL),
    },
    {
      key: 'cogs',
      label: COGS_LABEL,
      value: cogsValue,
      color: COST_STRUCTURE_COLORS.cogs,
      hint: getCostStructureExplanation(COGS_LABEL),
    },
  ])

  const netProfitSegment: CostStructureSegment = {
    key: 'netProfit',
    label: NET_PROFIT_LABEL,
    value: netProfitValue,
    color: COST_STRUCTURE_COLORS.netProfit,
    hint: getCostStructureExplanation(NET_PROFIT_LABEL),
  }

  return {
    baseValue,
    segments: [...expenseSegments, netProfitSegment],
  }
}

function buildWildberriesCostStructureModel(
  totalsReport: AccrualGroup,
  groupedReport: AccrualGroup,
): CostStructureModel | null {
  const baseValue = Math.max(getMetricValue(totalsReport, REVENUE_BEFORE_SPP_LABEL), 0)
  if (baseValue <= 0) return null

  const returnsMetric = getMetric(totalsReport, RETURNS_LABEL)
  const isReturnsCount = returnsMetric?.type === 'count'
  const taxValue = Math.abs(getMetricValue(totalsReport, TAX_LABEL))
  const cogsValue = Math.abs(getMetricValue(totalsReport, COGS_LABEL))
  const netProfitValue = Math.max(getMetricValue(totalsReport, NET_PROFIT_LABEL), 0)

  const groupedExpenseSegments = groupedReport.metrics
    .filter((metric) => metric.value !== null && metric.value < 0)
    .filter((metric) =>
      metric.label !== WB_SALES_AND_RETURNS_GROUP_LABEL
      && metric.label !== WB_SALES_GROUP_LABEL
      && metric.label !== GROUPED_TOTAL_LABEL
      && !GROUPED_SUBTOTAL_LABELS.has(metric.label))
    .sort((a, b) => Math.abs((b.value || 0)) - Math.abs((a.value || 0)))
    .map((metric, index) => ({
      key: `wb-group-${metric.label}`,
      label: metric.label,
      value: Math.abs(metric.value || 0),
      color: WB_EXPENSE_PALETTE[index % WB_EXPENSE_PALETTE.length],
      hint: getCostStructureExplanation(metric.label),
    }))

  const topGroupedSegments = groupedExpenseSegments.slice(0, WB_MAX_GROUP_SEGMENTS)
  const groupedTailSum = groupedExpenseSegments
    .slice(WB_MAX_GROUP_SEGMENTS)
    .reduce((acc, segment) => acc + segment.value, 0)
  if (groupedTailSum > 0) {
    topGroupedSegments.push({
      key: 'wb-group-other',
      label: WB_OTHER_EXPENSES_LABEL,
      value: groupedTailSum,
      color: WB_EXPENSE_PALETTE[WB_MAX_GROUP_SEGMENTS % WB_EXPENSE_PALETTE.length],
      hint: getCostStructureExplanation(WB_OTHER_EXPENSES_LABEL),
    })
  }

  const addonSegments: CostStructureSegment[] = []
  if (!isReturnsCount) {
    const returnsValue = Math.abs(returnsMetric?.value ?? 0)
    if (returnsValue > 0) {
      addonSegments.push({
        key: 'wb-returns',
        label: RETURNS_LABEL,
        value: returnsValue,
        color: COST_STRUCTURE_COLORS.returns,
        hint: getCostStructureExplanation(RETURNS_LABEL),
      })
    }
  }
  if (taxValue > 0) {
    addonSegments.push({
      key: 'wb-tax',
      label: TAX_LABEL,
      value: taxValue,
      color: COST_STRUCTURE_COLORS.tax,
      hint: getCostStructureExplanation(TAX_LABEL),
    })
  }
  if (cogsValue > 0) {
    addonSegments.push({
      key: 'wb-cogs',
      label: COGS_LABEL,
      value: cogsValue,
      color: COST_STRUCTURE_COLORS.cogs,
      hint: getCostStructureExplanation(COGS_LABEL),
    })
  }

  const expenseSegments = sortCostStructureSegments([...topGroupedSegments, ...addonSegments])

  const netProfitSegment: CostStructureSegment = {
    key: 'wb-net-profit',
    label: NET_PROFIT_LABEL,
    value: netProfitValue,
    color: COST_STRUCTURE_COLORS.netProfit,
    hint: getCostStructureExplanation(NET_PROFIT_LABEL),
  }

  return {
    baseValue,
    segments: [...expenseSegments, netProfitSegment],
  }
}

function formatOverviewCurrency(value: number | null): string {
  if (value === null) return formatValue(value, 'currency')
  return formatValue(Math.round(value), 'currency')
}

function formatShare(value: number, total: number): string {
  if (total <= 0) return '0%'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format((value / total) * 100)}%`
}

export function AccrualCostStructure({ reports }: AccrualCostStructureProps) {
  const costStructureModel = buildCostStructureModel(reports)
  if (!costStructureModel) return null

  const chartData = costStructureModel.segments.filter((segment) => segment.value > 0)
  const renderTooltipContent = (tooltipProps?: RechartsTooltipProps): React.ReactNode => {
    if (!tooltipProps?.active || !tooltipProps.payload || tooltipProps.payload.length === 0) return null
    const data = tooltipProps.payload[0].payload

    return (
      <div className={cn(`${BLOCK_NAME}__chart-tooltip`)}>
        <Typography variant="body3" color="light" bold>{data.label}</Typography>
        <Typography variant="body3" color="light">{formatOverviewCurrency(data.value)}</Typography>
        <Typography variant="body3" color="light">{formatShare(data.value, costStructureModel.baseValue)}</Typography>
      </div>
    )
  }

  return (
    <article className={cn(BLOCK_NAME)}>
      <header className={cn(`${BLOCK_NAME}__header`)}>
        <Typography variant="h3" color="accent">Структура затрат и прибыли</Typography>
        <Typography variant="body2" color="muted">
          100% = {formatOverviewCurrency(costStructureModel.baseValue)} ({REVENUE_BEFORE_SPP_LABEL})
        </Typography>
      </header>
      <div className={cn(`${BLOCK_NAME}__layout`)}>
        <div className={cn(`${BLOCK_NAME}__chart`)}>
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={84}
                outerRadius={138}
                paddingAngle={2}
                isAnimationActive
              >
                {chartData.map((segment) => (
                  <Cell key={segment.key} fill={segment.color} stroke={segment.color} />
                ))}
              </Pie>
              <RechartsTooltip
                content={(tooltipProps) => renderTooltipContent(tooltipProps as unknown as RechartsTooltipProps)}
                cursor={false}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className={cn(`${BLOCK_NAME}__legend`)}>
          {costStructureModel.segments.map((segment) => (
            <li key={segment.key} className={cn(`${BLOCK_NAME}__item`)}>
              <div className={cn(`${BLOCK_NAME}__item-left`)}>
                <span
                  className={cn(`${BLOCK_NAME}__dot`)}
                  style={{ backgroundColor: segment.color }}
                />
                <Typography variant="body1" color="primary" semiBold>{segment.label}</Typography>
                <InfoTooltip
                  ariaLabel={`Пояснение для категории ${segment.label}`}
                  content={segment.hint}
                />
              </div>
              <div className={cn(`${BLOCK_NAME}__item-right`)}>
                <Typography
                  variant="body2"
                  color="primary"
                  semiBold
                  className={cn(`${BLOCK_NAME}__value-nowrap`)}
                >
                  {formatOverviewCurrency(segment.value)}
                </Typography>
                <Typography variant="body2" color="muted" semiBold className={cn(`${BLOCK_NAME}__value-nowrap`)}>
                  {formatShare(segment.value, costStructureModel.baseValue)}
                </Typography>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
