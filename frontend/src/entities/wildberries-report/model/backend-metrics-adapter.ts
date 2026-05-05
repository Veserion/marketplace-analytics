import type { MarketplaceMetricsResponse } from '@/shared/api/marketplace-metrics'
import type { AccrualGroup } from '@/shared/lib/report-types'

function mapWildberriesFulfillmentLabel(label: string): string {
  if (label.startsWith('FBM')) return label.replace(/^FBM(?:\s*[—-]\s*)?/, 'FBW — склад ВБ')
  if (label === 'fbs') return 'FBS — склад продавца'
  if (label === 'fbm') return 'FBW — склад ВБ'
  return label
}

export function mapWildberriesBackendMetricsToAccrualGroups(response: MarketplaceMetricsResponse): AccrualGroup[] {
  return response.reportGroups.map((group) => ({
    ...group,
    metrics: group.metrics.map((metric) => ({
      ...metric,
      label: group.title === 'Схема работы' ? mapWildberriesFulfillmentLabel(metric.label) : metric.label,
      formula: metric.formula ?? 'Рассчитано на backend.',
    })),
  }))
}

export function getWildberriesBackendMissingCogsArticles(response: MarketplaceMetricsResponse | undefined): string[] {
  return response?.dataQuality?.missingCogsArticles ?? []
}
