const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api').replace(/\/$/, '')

type ApiRequestOptions = RequestInit & {
  token?: string
}

export class ApiError extends Error {
  status: number
  rateLimit?: { retryAfter?: number; limit?: number; reset?: number }

  constructor(message: string, status: number, rateLimit?: { retryAfter?: number; limit?: number; reset?: number }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.rateLimit = rateLimit
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })
  const payload = await response.json().catch(() => null) as { error?: string } | T | null

  if (!response.ok) {
    const errorPayload = payload as { error?: string; message?: string; rateLimit?: { retryAfter?: number; limit?: number; reset?: number } } | null
    const message = errorPayload?.message || errorPayload?.error || 'Не удалось выполнить запрос.'
    throw new ApiError(message, response.status, errorPayload?.rateLimit)
  }

  return payload as T
}
