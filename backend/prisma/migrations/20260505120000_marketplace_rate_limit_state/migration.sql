-- CreateTable
CREATE TABLE "MarketplaceRateLimitState" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "marketplaceConnectionId" TEXT,
    "blockedUntil" TIMESTAMP(3),
    "lastRetryAfterSeconds" INTEGER,
    "lastResetSeconds" INTEGER,
    "lastLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceRateLimitState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceRateLimitState_scopeKey_key" ON "MarketplaceRateLimitState"("scopeKey");

-- CreateIndex
CREATE INDEX "MarketplaceRateLimitState_organizationId_marketplace_idx" ON "MarketplaceRateLimitState"("organizationId", "marketplace");

-- CreateIndex
CREATE INDEX "MarketplaceRateLimitState_blockedUntil_idx" ON "MarketplaceRateLimitState"("blockedUntil");
