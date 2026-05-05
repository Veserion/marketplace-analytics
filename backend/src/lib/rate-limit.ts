type RateLimitOptions = {
  limit: number
  windowMs: number
}

type RateLimitEntry = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitEntry>()

export function isRateLimited(key: string, options: RateLimitOptions): boolean {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs })
    return false
  }

  if (existing.count >= options.limit) {
    return true
  }

  existing.count += 1
  return false
}
