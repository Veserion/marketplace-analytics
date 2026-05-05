import type { Marketplace, PrismaClient } from '@prisma/client'

type MarketplaceRateLimitScope = {
  marketplace: Marketplace
  organizationId: string
  marketplaceConnectionId?: string | null
}

type RateLimitInfo = {
  retryAfter?: number
  limit?: number
  reset?: number
}

const RATE_LIMIT_GAP_SECONDS = 2

export class MarketplaceRateLimitBlockedError extends Error {
  rateLimit: {
    retryAfter: number
    blockedUntil: string
    limit?: number
    reset?: number
  }

  constructor(rateLimit: MarketplaceRateLimitBlockedError['rateLimit']) {
    super(`Marketplace API is rate limited. Retry after ${rateLimit.retryAfter} seconds.`)
    this.name = 'MarketplaceRateLimitBlockedError'
    this.rateLimit = rateLimit
  }
}

function buildScopeKey(scope: MarketplaceRateLimitScope): string {
  return [
    scope.marketplace,
    scope.organizationId,
    scope.marketplaceConnectionId ?? 'default',
  ].join(':')
}

export async function assertMarketplaceRateLimitAvailable(
  prisma: PrismaClient,
  scope: MarketplaceRateLimitScope,
): Promise<void> {
  const state = await prisma.marketplaceRateLimitState.findUnique({
    where: { scopeKey: buildScopeKey(scope) },
  })

  if (!state?.blockedUntil) return

  const now = Date.now()
  const blockedUntilMs = state.blockedUntil.getTime()
  if (blockedUntilMs <= now) return

  throw new MarketplaceRateLimitBlockedError({
    retryAfter: Math.ceil((blockedUntilMs - now) / 1000),
    blockedUntil: state.blockedUntil.toISOString(),
    limit: state.lastLimit ?? undefined,
    reset: state.lastResetSeconds ?? undefined,
  })
}

export async function recordMarketplaceRateLimit(
  prisma: PrismaClient,
  scope: MarketplaceRateLimitScope,
  rateLimit: RateLimitInfo,
): Promise<void> {
  const retryAfter = Math.max(1, rateLimit.retryAfter ?? 60)
  const blockedUntil = new Date(Date.now() + (retryAfter + RATE_LIMIT_GAP_SECONDS) * 1000)
  const scopeKey = buildScopeKey(scope)

  await prisma.marketplaceRateLimitState.upsert({
    where: { scopeKey },
    create: {
      scopeKey,
      organizationId: scope.organizationId,
      marketplace: scope.marketplace,
      marketplaceConnectionId: scope.marketplaceConnectionId ?? null,
      blockedUntil,
      lastRetryAfterSeconds: rateLimit.retryAfter ?? null,
      lastResetSeconds: rateLimit.reset ?? null,
      lastLimit: rateLimit.limit ?? null,
    },
    update: {
      blockedUntil,
      lastRetryAfterSeconds: rateLimit.retryAfter ?? null,
      lastResetSeconds: rateLimit.reset ?? null,
      lastLimit: rateLimit.limit ?? null,
    },
  })
}
