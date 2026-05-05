import assert from 'node:assert/strict'
import { afterEach, before, describe, it } from 'node:test'

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/db'
process.env.JWT_SECRET ??= 'test-jwt-secret-with-at-least-32-chars'
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-with-at-least-32-chars'
process.env.WB_API_TIMEOUT_MS = '5'

let wbApi: typeof import('./wb-api.js')
let originalFetch: typeof globalThis.fetch

before(async () => {
  originalFetch = globalThis.fetch
  wbApi = await import('./wb-api.js')
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('WB API client', () => {
  it('treats 204 as an empty page', async () => {
    globalThis.fetch = async () => new Response(null, { status: 204 })

    const result = await wbApi.fetchWbApiPage('token', '2026-04-06', '2026-04-12')

    assert.deepEqual(result, { rows: [], lastRrdId: null, hasMore: false })
  })

  it('throws a typed rate limit error with headers', async () => {
    globalThis.fetch = async () => new Response('rate limited', {
      status: 429,
      headers: {
        'X-Ratelimit-Retry': '2',
        'X-Ratelimit-Limit': '10',
        'X-Ratelimit-Reset': '29',
      },
    })

    await assert.rejects(
      () => wbApi.fetchWbApiPage('token', '2026-04-06', '2026-04-12'),
      (error) => {
        assert.ok(error instanceof wbApi.WbApiRateLimitError)
        assert.deepEqual(error.rateLimit, { retryAfter: 2, limit: 10, reset: 29 })
        return true
      },
    )
  })

  it('rejects malformed successful responses', async () => {
    globalThis.fetch = async () => Response.json({ rows: [] })

    await assert.rejects(
      () => wbApi.fetchWbApiPage('token', '2026-04-06', '2026-04-12'),
      wbApi.WbApiMalformedResponseError,
    )
  })

  it('aborts requests that exceed configured timeout', async () => {
    globalThis.fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })

    await assert.rejects(
      () => wbApi.fetchWbApiPage('token', '2026-04-06', '2026-04-12'),
      wbApi.WbApiTimeoutError,
    )
  })
})
