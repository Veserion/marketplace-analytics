import { env } from '../../env.js'

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

export class WbApiAuthError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'WbApiAuthError'
    this.status = status
  }
}

export class WbApiTimeoutError extends Error {
  constructor(message = 'WB Finance API request timed out') {
    super(message)
    this.name = 'WbApiTimeoutError'
  }
}

export class WbApiServerError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'WbApiServerError'
    this.status = status
  }
}

export class WbApiMalformedResponseError extends Error {
  constructor(message = 'WB Finance API returned malformed response') {
    super(message)
    this.name = 'WbApiMalformedResponseError'
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
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), env.WB_API_TIMEOUT_MS)
  let response: Response

  try {
    response = await fetch(WB_API_URL, {
      method: 'POST',
      signal: abortController.signal,
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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new WbApiTimeoutError()
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (response.status === 204) {
    return { rows: [], lastRrdId: null, hasMore: false }
  }

  if (!response.ok) {
    if (response.status === 429) {
      const rateLimit: WbApiRateLimitInfo = {
        retryAfter: response.headers.get('X-Ratelimit-Retry') ? parseInt(response.headers.get('X-Ratelimit-Retry')!, 10) : undefined,
        limit: response.headers.get('X-Ratelimit-Limit') ? parseInt(response.headers.get('X-Ratelimit-Limit')!, 10) : undefined,
        reset: response.headers.get('X-Ratelimit-Reset') ? parseInt(response.headers.get('X-Ratelimit-Reset')!, 10) : undefined,
      }
      const errorText = await response.text()
      throw new WbApiRateLimitError(`WB Finance API rate limit exceeded: ${errorText}`, rateLimit)
    }

    if (response.status === 401 || response.status === 403) {
      const errorText = await response.text()
      throw new WbApiAuthError(response.status, `WB Finance API auth error: ${response.status} - ${errorText}`)
    }

    const errorText = await response.text()
    throw new WbApiServerError(response.status, `WB Finance API error: ${response.status} - ${errorText}`)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new WbApiMalformedResponseError()
  }

  if (!Array.isArray(data)) {
    throw new WbApiMalformedResponseError()
  }

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
