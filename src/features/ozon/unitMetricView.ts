import type { MetricKey, ReportGroup, ReportMetric } from '../../types/reports'
import { formatValue } from '../../utils/csv'

const EXPENSE_WITH_SHARE_KEYS: MetricKey[] = [
  'commission',
  'logistics',
  'acquiring',
  'adsCost',
  'otherExpenses',
  'reverseLogistics',
  'cogs',
]

export type UnitMetricDisplay = {
  valueText: string
  shareText: string | null
}

export function getUnitMetricDisplay(metric: ReportMetric, report: ReportGroup): UnitMetricDisplay {
  if (metric.key === 'cancellations') return { valueText: '-', shareText: null }
  if (!metric.ok) return { valueText: 'нет данных', shareText: null }

  const mainValue = formatValue(metric.value, metric.type)
  const revenueBeforeSpp = report.metrics.find((item) => item.key === 'revenueBeforeSpp')?.value

  if (
    metric.key === 'tax'
    && metric.value !== null
    && revenueBeforeSpp !== null
    && revenueBeforeSpp !== undefined
    && revenueBeforeSpp !== 0
  ) {
    const totalTaxRatePercent = (metric.value / revenueBeforeSpp) * 100
    const totalRateText = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(totalTaxRatePercent)
    return { valueText: `${mainValue} (${totalRateText}%)`, shareText: null }
  }

  if (!EXPENSE_WITH_SHARE_KEYS.includes(metric.key) || metric.value === null) {
    return { valueText: mainValue, shareText: null }
  }

  if (revenueBeforeSpp === null || revenueBeforeSpp === undefined || revenueBeforeSpp === 0) {
    return { valueText: mainValue, shareText: null }
  }

  const sharePercent = (Math.abs(metric.value) / revenueBeforeSpp) * 100
  const shareValue = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(sharePercent)
  return { valueText: mainValue, shareText: `${shareValue}%` }
}

export function getUnitMetricDisplayValue(metric: ReportMetric, report: ReportGroup): string {
  const display = getUnitMetricDisplay(metric, report)
  return display.shareText ? `${display.valueText} — ${display.shareText}` : display.valueText
}

export function getUnitMetricClassValue(metric: ReportMetric): number | null {
  if (metric.key === 'cancellations') return null
  return metric.ok ? metric.value : null
}
