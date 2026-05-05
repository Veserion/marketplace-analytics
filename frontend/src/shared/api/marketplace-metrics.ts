import { apiRequest } from '@/shared/api/client'
import type { Marketplace } from '@/shared/api/use-marketplace-connection'
import type { AccrualGroup } from '@/shared/lib/report-types'

export type MarketplaceMetricsResponse = {
  marketplace: Marketplace
  requestedPeriod: { from: string; to: string }
  availablePeriod: { from: string; to: string }
  source: {
    weeklyReports: Array<{
      snapshotId: string
      periodFrom: string
      periodTo: string
      metricsCache: 'hit' | 'miss'
    }>
    cogsFileId: string | null
    cogsHash: string
    calculatorVersion: string
  }
  rowCount: number
  atoms: Record<string, number | null>
  molecules: Record<string, number | null>
  cells: Record<string, number | null>
  breakdowns: Record<string, unknown>
  dataQuality: {
    cogsMatchedRows: number
    missingCogsArticles: string[]
    warnings: string[]
  }
  reportGroups: AccrualGroup[]
}

export async function fetchMarketplaceAccrualMetrics(input: {
  token: string
  marketplace: Marketplace
  periodFrom: string
  periodTo: string
  filters: {
    articlePattern: string
    excludeArticlePattern: boolean
    priceMin: number | null
    priceMax: number | null
  }
  params: {
    vatRatePercent: number
    taxRatePercent: number
    cogsMatchingMode: 'full' | 'digits'
  }
}): Promise<MarketplaceMetricsResponse> {
  return apiRequest<MarketplaceMetricsResponse>(`/marketplaces/${input.marketplace}/metrics/accrual`, {
    token: input.token,
    method: 'POST',
    body: JSON.stringify({
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      filters: input.filters,
      params: input.params,
    }),
  })
}
