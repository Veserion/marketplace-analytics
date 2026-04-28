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
const WB_OTHER_EXPENSES_LABEL = 'Прочие расходы WB'
const COST_STRUCTURE_COLORS = {
  commission: '#2d79d5',
  promotion: '#e85a9b',
  returns: '#f08359',
  tax: '#d9b15e',
  cogs: '#8c7ed8',
  netProfit: '#2e9b6e',
}
const WB_EXPENSE_PALETTE = ['#2d79d5', '#8c7ed8', '#e85a9b', '#5fa9d7', '#d9b15e', '#f08359']
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

function buildCostStructureModel(reports: AccrualGroup[]): CostStructureModel | null {
  const totalsReport = reports.find((report) => report.title === 'Итоги периода')
  const groupedReport = reports.find((report) => report.title === GROUPED_EXPENSES_REPORT_TITLE)
  if (!totalsReport || !groupedReport) return null

  const isOzonAccrual = groupedReport.metrics.some((metric) => metric.label === COMMISSION_OZON_SOURCE_LABEL)
  if (!isOzonAccrual) {
    return buildWildberriesCostStructureModel(totalsReport, groupedReport)
  }

  const revenueBeforeSppNet = getMetricValue(totalsReport, REVENUE_BEFORE_SPP_LABEL)
  const returnsValue = Math.abs(getMetricValue(totalsReport, RETURNS_LABEL))
  const baseValue = Math.max(revenueBeforeSppNet + returnsValue, 0)
  if (baseValue <= 0) return null

  const commissionComponents = [
    COMMISSION_OZON_SOURCE_LABEL,
    FBO_SERVICES_LABEL,
    LOGISTICS_LABEL,
    PARTNER_SERVICES_LABEL,
    OTHER_SERVICES_LABEL,
  ]
  const groupedValue = (label: string): number => getMetricValue(groupedReport, label)
  const commissionValue = commissionComponents.reduce((acc, label) => acc + Math.abs(groupedValue(label)), 0)
  const promotionValue = Math.abs(groupedValue(PROMOTION_LABEL))
  const taxValue = Math.abs(getMetricValue(totalsReport, TAX_LABEL))
  const cogsValue = Math.abs(getMetricValue(totalsReport, COGS_LABEL))
  const netProfitValue = Math.max(baseValue - (commissionValue + promotionValue + returnsValue + taxValue + cogsValue), 0)

  const expenseSegments: CostStructureSegment[] = [
    {
      key: 'commission',
      label: COMMISSION_OZON_DISPLAY_LABEL,
      value: commissionValue,
      color: COST_STRUCTURE_COLORS.commission,
      hint: 'ABS(Комиссия Ozon) + ABS(Услуги ФБО) + ABS(Логистика) + ABS(Услуги партнеров) + ABS(Другие услуги и штрафы) из блока "Общие затраты по Маркетплейсу".',
    },
    {
      key: 'promotion',
      label: PROMOTION_LABEL,
      value: promotionValue,
      color: COST_STRUCTURE_COLORS.promotion,
      hint: 'ABS(категории "Продвижение") из блока "Общие затраты по Маркетплейсу".',
    },
    {
      key: 'returns',
      label: RETURNS_LABEL,
      value: returnsValue,
      color: COST_STRUCTURE_COLORS.returns,
      hint: 'ABS(метрики "Возвраты" из блока "Итоги периода"), учитывается как расход.',
    },
    {
      key: 'tax',
      label: TAX_LABEL,
      value: taxValue,
      color: COST_STRUCTURE_COLORS.tax,
      hint: 'ABS(метрики "Налог" из блока "Итоги периода").',
    },
    {
      key: 'cogs',
      label: COGS_LABEL,
      value: cogsValue,
      color: COST_STRUCTURE_COLORS.cogs,
      hint: 'ABS(метрики "Себестоимость" из блока "Итоги периода").',
    },
  ]
    .sort((a, b) => b.value - a.value)

  const netProfitSegment: CostStructureSegment = {
    key: 'netProfit',
    label: NET_PROFIT_LABEL,
    value: netProfitValue,
    color: COST_STRUCTURE_COLORS.netProfit,
    hint: 'MAX(0, База - (Расходы по Ozon + Продвижение + Возвраты + Налог + Себестоимость)), где База = Выручка с учетом СПП + ABS(Возвраты).',
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

  const returnsValue = Math.abs(getMetricValue(totalsReport, RETURNS_LABEL))
  const taxValue = Math.abs(getMetricValue(totalsReport, TAX_LABEL))
  const cogsValue = Math.abs(getMetricValue(totalsReport, COGS_LABEL))

  const groupedExpenseSegments = groupedReport.metrics
    .filter((metric) => metric.value !== null && metric.value < 0)
    .filter((metric) =>
      metric.label !== WB_SALES_AND_RETURNS_GROUP_LABEL
      && metric.label !== WB_SALES_GROUP_LABEL
      && metric.label !== GROUPED_TOTAL_LABEL)
    .sort((a, b) => Math.abs((b.value || 0)) - Math.abs((a.value || 0)))
    .map((metric, index) => ({
      key: `wb-group-${metric.label}`,
      label: metric.label,
      value: Math.abs(metric.value || 0),
      color: WB_EXPENSE_PALETTE[index % WB_EXPENSE_PALETTE.length],
      hint: `ABS(категории "${metric.label}") из блока "Общие затраты по Маркетплейсу".`,
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
      hint: `Сумма остальных отрицательных категорий из "Общие затраты по Маркетплейсу" вне топ-${WB_MAX_GROUP_SEGMENTS}.`,
    })
  }

  const addonSegments: CostStructureSegment[] = []
  if (returnsValue > 0) {
    addonSegments.push({
      key: 'wb-returns',
      label: RETURNS_LABEL,
      value: returnsValue,
      color: COST_STRUCTURE_COLORS.returns,
      hint: 'ABS(метрики "Возвраты" из блока "Итоги периода"), учитывается как расход.',
    })
  }
  if (taxValue > 0) {
    addonSegments.push({
      key: 'wb-tax',
      label: TAX_LABEL,
      value: taxValue,
      color: COST_STRUCTURE_COLORS.tax,
      hint: 'ABS(метрики "Налог" из блока "Итоги периода").',
    })
  }
  if (cogsValue > 0) {
    addonSegments.push({
      key: 'wb-cogs',
      label: COGS_LABEL,
      value: cogsValue,
      color: COST_STRUCTURE_COLORS.cogs,
      hint: 'ABS(метрики "Себестоимость" из блока "Итоги периода").',
    })
  }

  const expenseSegments = [...topGroupedSegments, ...addonSegments].sort((a, b) => b.value - a.value)
  const totalExpenses = expenseSegments.reduce((acc, segment) => acc + segment.value, 0)
  const netProfitValue = Math.max(baseValue - totalExpenses, 0)

  const netProfitSegment: CostStructureSegment = {
    key: 'wb-net-profit',
    label: NET_PROFIT_LABEL,
    value: netProfitValue,
    color: COST_STRUCTURE_COLORS.netProfit,
    hint: 'MAX(0, Выручка с учетом СПП - сумма всех расходов в этом блоке).',
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
