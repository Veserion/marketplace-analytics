export type Marketplace = 'wildberries' | 'ozon'
export type OzonCalculationType = 'unitEconomics' | 'accrualReport'
export type ValueType = 'number' | 'currency' | 'percent'

export type MetricKey =
  | 'sales'
  | 'returns'
  | 'buyout'
  | 'buyoutRate'
  | 'revenueBeforeSpp'
  | 'commission'
  | 'logistics'
  | 'acquiring'
  | 'tax'
  | 'cogs'
  | 'adsCost'
  | 'otherExpenses'
  | 'netRevenue'
  | 'marginRate'
  | 'drr'

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
}

export type AccrualMetric = {
  label: string
  value: number | null
  type: ValueType
  formula: string
}

export type AccrualGroup = {
  title: string
  rowCount?: number
  metrics: AccrualMetric[]
}
