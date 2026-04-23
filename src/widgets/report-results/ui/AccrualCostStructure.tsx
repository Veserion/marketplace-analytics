import classNames from 'classnames/bind'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import { formatValue } from '@/shared/lib/csv'
import { Typography, UiTooltipIcon } from '@/shared/ui-kit'
import styles from './AccrualCostStructure.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AccrualCostStructure'
const REVENUE_BEFORE_SPP_LABEL = 'Выручка до СПП'
const RETURNS_LABEL = 'Возвраты'
const TAX_LABEL = 'Налог'
const COGS_LABEL = 'Себестоимость'
const PROMOTION_LABEL = 'Продвижение'
const COMMISSION_OZON_SOURCE_LABEL = 'Комиссия Ozon'
const COMMISSION_OZON_DISPLAY_LABEL = 'Расходы по Ozon'
const FBO_SERVICES_LABEL = 'Услуги ФБО'
const LOGISTICS_LABEL = 'Логистика'
const PARTNER_SERVICES_LABEL = 'Услуги партнеров'
const OTHER_SERVICES_LABEL = 'Другие услуги и штрафы'
const NET_PROFIT_LABEL = 'Чистая прибыль'
const COST_STRUCTURE_COLORS = {
  commission: '#2d79d5',
  promotion: '#e85a9b',
  returns: '#f08359',
  tax: '#d9b15e',
  cogs: '#8c7ed8',
  netProfit: '#2e9b6e',
}

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
  const groupedReport = reports.find((report) => report.title === 'Начисления по группам')
  if (!totalsReport || !groupedReport) return null

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
      hint: 'Сумма категорий: Комиссия Ozon + Услуги ФБО + Логистика + Услуги партнеров + Другие услуги и штрафы.',
    },
    {
      key: 'promotion',
      label: PROMOTION_LABEL,
      value: promotionValue,
      color: COST_STRUCTURE_COLORS.promotion,
      hint: 'Сумма категории "Продвижение" из блока "Начисления по группам".',
    },
    {
      key: 'returns',
      label: RETURNS_LABEL,
      value: returnsValue,
      color: COST_STRUCTURE_COLORS.returns,
      hint: 'Сумма категории "Возвраты" из отчета по начислениям (учитывается как расход).',
    },
    {
      key: 'tax',
      label: TAX_LABEL,
      value: taxValue,
      color: COST_STRUCTURE_COLORS.tax,
      hint: 'Налог по формуле из "Итоги периода".',
    },
    {
      key: 'cogs',
      label: COGS_LABEL,
      value: cogsValue,
      color: COST_STRUCTURE_COLORS.cogs,
      hint: 'Себестоимость из загруженного источника данных.',
    },
  ]
    .sort((a, b) => b.value - a.value)

  const netProfitSegment: CostStructureSegment = {
    key: 'netProfit',
    label: NET_PROFIT_LABEL,
    value: netProfitValue,
    color: COST_STRUCTURE_COLORS.netProfit,
    hint: 'Остаток от Выручки до СПП: Выручка до СПП - (Комиссия Ozon + Продвижение + Возвраты + Налог + Себестоимость).',
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

function CostStructureTooltip({
  active,
  payload,
  baseValue,
}: RechartsTooltipProps & { baseValue: number }) {
  if (!active || !payload || payload.length === 0) return null
  const data = payload[0].payload

  return (
    <div className={cn(`${BLOCK_NAME}__chart-tooltip`)}>
      <Typography variant="body3" color="light" bold>{data.label}</Typography>
      <Typography variant="body3" color="light">{formatOverviewCurrency(data.value)}</Typography>
      <Typography variant="body3" color="light">{formatShare(data.value, baseValue)}</Typography>
    </div>
  )
}

export function AccrualCostStructure({ reports }: AccrualCostStructureProps) {
  const costStructureModel = buildCostStructureModel(reports)
  if (!costStructureModel) return null

  const chartData = costStructureModel.segments.filter((segment) => segment.value > 0)

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
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={66}
                outerRadius={112}
                paddingAngle={2}
                isAnimationActive
              >
                {chartData.map((segment) => (
                  <Cell key={segment.key} fill={segment.color} stroke={segment.color} />
                ))}
              </Pie>
              <RechartsTooltip
                content={<CostStructureTooltip baseValue={costStructureModel.baseValue} />}
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
                <UiTooltipIcon
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
                <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__value-nowrap`)}>
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
