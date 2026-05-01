export type ValueType = 'number' | 'currency' | 'percent' | 'count'

export type AccrualMetric = {
  label: string
  value: number | null
  type: ValueType
  formula: string
  shareText?: string | null
}

export type AccrualGroup = {
  title: string
  rowCount?: number
  periodLabel?: string
  metrics: AccrualMetric[]
}
