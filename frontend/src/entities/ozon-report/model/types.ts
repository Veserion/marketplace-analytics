import type { ValueType } from '@/shared/lib/report-types'

export type { AccrualGroup, AccrualMetric, ValueType } from '@/shared/lib/report-types'

export type Marketplace = 'wildberries' | 'ozon'
export type OzonCalculationType = 'unitEconomics' | 'accrualReport'

export type MetricKey =
  | 'sales'
  | 'returns'
  | 'cancellations'
  | 'buyout'
  | 'buyoutRate'
  | 'revenueBeforeSpp'
  | 'revenueAfterSpp'
  | 'accruedPoints'
  | 'partnerCompensation'
  | 'commission'
  | 'logistics'
  | 'reverseLogistics'
  | 'acquiring'
  | 'tax'
  | 'cogs'
  | 'adsCost'
  | 'otherExpenses'
  | 'netRevenue'
  | 'marginRate'

export type MetricView = {
  key: MetricKey
  label: string
  formula: string
  type: ValueType
}

export type ReportMetric = {
  key: MetricKey
  label: string
  formula: string
  value: number | null
  ok: boolean
  type: ValueType
}

export type ReportGroup = {
  title: string
  rowCount: number
  metrics: ReportMetric[]
  availabilityGroups?: AvailabilityGroups
  productMargins?: ProductMarginItem[]
}

export type AvailabilityGroups = {
  urgent: string[]
  maintain: string[]
  enough: string[]
}

export type ProductMarginItem = {
  article: string
  marginSharePercent: number
  profitPerUnit: number | null
}
