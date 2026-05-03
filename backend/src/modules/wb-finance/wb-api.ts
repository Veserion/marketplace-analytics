import { generateReportFilePath, generateReportFileName, type WB_DEFAULT_FIELDS } from './utils.js'

const WB_API_URL = 'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed'

export interface WbApiResponse {
  rows?: unknown[]
  cursor?: {
    rrdId?: number
  }
}

export interface WbApiRateLimitInfo {
  retryAfter?: number
  limit?: number
  reset?: number
}

export class WbApiRateLimitError extends Error {
  status: number
  rateLimit?: WbApiRateLimitInfo

  constructor(message: string, rateLimit?: WbApiRateLimitInfo) {
    super(message)
    this.name = 'WbApiRateLimitError'
    this.status = 429
    this.rateLimit = rateLimit
  }
}

export interface WbApiReportRow {
  rrdId?: number
  docTypeName?: string
  sellerOperName?: string
  nmId?: number
  vendorCode?: string
  sku?: number
  title?: string
  subjectName?: string
  brandName?: string
  orderDt?: string
  saleDt?: string
  rrDate?: string
  retailPriceWithDisc?: string
  commissionPercent?: number
  forPay?: string
  acquiringFee?: string
  deliveryService?: string
  paidStorage?: string
  deduction?: string
  paidAcceptance?: string
  penalty?: string
  additionalPayment?: string
  ppvzReward?: string
  rebillLogisticCost?: string
  cashbackAmount?: string
  cashbackDiscount?: number
  cashbackCommissionChange?: string
  srid?: string
  orderUid?: string
}

/**
 * Fetch a single page of data from WB API with pagination support.
 */
export async function fetchWbApiPage(
  token: string,
  dateFrom: string,
  dateTo: string,
  rrdId: number = 0,
  limit: number = 100000,
  fields: readonly string[] = [],
): Promise<{ rows: WbApiReportRow[]; lastRrdId: number | null; hasMore: boolean }> {
  const response = await fetch(WB_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      dateFrom,
      dateTo,
      limit,
      rrdId,
      fields,
    }),
  })

  if (!response.ok) {
    if (response.status === 204) {
      return { rows: [], lastRrdId: null, hasMore: false }
    }
    if (response.status === 429) {
      const rateLimit: WbApiRateLimitInfo = {
        retryAfter: response.headers.get('X-Ratelimit-Retry') ? parseInt(response.headers.get('X-Ratelimit-Retry')!, 10) : undefined,
        limit: response.headers.get('X-Ratelimit-Limit') ? parseInt(response.headers.get('X-Ratelimit-Limit')!, 10) : undefined,
        reset: response.headers.get('X-Ratelimit-Reset') ? parseInt(response.headers.get('X-Ratelimit-Reset')!, 10) : undefined,
      }
      const errorText = await response.text()
      throw new WbApiRateLimitError(`WB Finance API rate limit exceeded: ${errorText}`, rateLimit)
    }
    const errorText = await response.text()
    throw new Error(`WB Finance API error: ${response.status} - ${errorText}`)
  }

  const data = (await response.json()) as unknown[]
  const rows = data as WbApiReportRow[]

  // Get the last rrdId for pagination
  const lastRrdId: number | null = rows.length > 0 ? (rows[rows.length - 1].rrdId ?? null) : null

  // If we got fewer rows than the limit, we're done
  const hasMore = rows.length >= limit && lastRrdId !== null

  return { rows, lastRrdId, hasMore }
}

/**
 * Fetch all pages of data for a weekly period using pagination.
 */
export async function fetchWbApiWeeklyReport(
  token: string,
  dateFrom: string,
  dateTo: string,
  fields: readonly string[] = [],
  onProgress?: (rowsCount: number) => void,
): Promise<WbApiReportRow[]> {
  const allRows: WbApiReportRow[] = []
  let rrdId = 0
  let hasMore = true
  const limit = 100000

  while (hasMore) {
    const { rows, lastRrdId, hasMore: more } = await fetchWbApiPage(
      token,
      dateFrom,
      dateTo,
      rrdId,
      limit,
      fields,
    )

    allRows.push(...rows)

    if (onProgress) {
      onProgress(allRows.length)
    }

    hasMore = more
    rrdId = lastRrdId ?? 0

    if (rows.length === 0) {
      hasMore = false
    }
  }

  return allRows
}
