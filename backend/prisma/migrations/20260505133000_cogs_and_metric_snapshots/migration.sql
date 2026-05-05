CREATE TYPE "StoredArtifactStatus" AS ENUM ('processing', 'ready', 'error');

CREATE TABLE "MarketplaceCogsFile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "marketplace" "Marketplace" NOT NULL,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileSize" BIGINT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'text/csv',
  "rowsCount" INTEGER NOT NULL DEFAULT 0,
  "status" "StoredArtifactStatus" NOT NULL DEFAULT 'processing',
  "errorMessage" TEXT,
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "MarketplaceCogsFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceCogsItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "marketplace" "Marketplace" NOT NULL,
  "cogsFileId" TEXT NOT NULL,
  "article" TEXT NOT NULL,
  "articleNormalized" TEXT NOT NULL,
  "articleDigits" TEXT,
  "unitCost" DECIMAL(14,4) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketplaceCogsItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceWeeklyMetricSnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "marketplace" "Marketplace" NOT NULL,
  "reportType" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "sourceReportId" TEXT,
  "cogsFileId" TEXT,
  "cogsHash" TEXT NOT NULL,
  "calculatorVersion" TEXT NOT NULL,
  "status" "StoredArtifactStatus" NOT NULL DEFAULT 'processing',
  "atoms" JSONB NOT NULL DEFAULT '{}',
  "molecules" JSONB NOT NULL DEFAULT '{}',
  "cells" JSONB NOT NULL DEFAULT '{}',
  "breakdowns" JSONB NOT NULL DEFAULT '{}',
  "dataQuality" JSONB NOT NULL DEFAULT '{}',
  "rowsCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "calculatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketplaceWeeklyMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_marketplace_cogs_files_org_marketplace_deleted"
  ON "MarketplaceCogsFile"("organizationId", "marketplace", "deletedAt");

CREATE INDEX "idx_marketplace_cogs_files_org_marketplace_status"
  ON "MarketplaceCogsFile"("organizationId", "marketplace", "status");

CREATE UNIQUE INDEX "uniq_marketplace_active_cogs_file"
  ON "MarketplaceCogsFile"("organizationId", "marketplace")
  WHERE "deletedAt" IS NULL;

CREATE INDEX "idx_marketplace_cogs_items_article"
  ON "MarketplaceCogsItem"("organizationId", "marketplace", "articleNormalized");

CREATE INDEX "idx_marketplace_cogs_items_article_digits"
  ON "MarketplaceCogsItem"("organizationId", "marketplace", "articleDigits");

CREATE INDEX "idx_marketplace_cogs_items_file"
  ON "MarketplaceCogsItem"("cogsFileId");

CREATE UNIQUE INDEX "uniq_marketplace_weekly_metric_snapshot"
  ON "MarketplaceWeeklyMetricSnapshot"("organizationId", "marketplace", "reportType", "periodFrom", "periodTo", "cogsHash", "calculatorVersion");

CREATE INDEX "idx_marketplace_weekly_metric_snapshots_period"
  ON "MarketplaceWeeklyMetricSnapshot"("organizationId", "marketplace", "periodFrom", "periodTo");

CREATE INDEX "idx_marketplace_weekly_metric_snapshots_status"
  ON "MarketplaceWeeklyMetricSnapshot"("organizationId", "marketplace", "status");

ALTER TABLE "MarketplaceCogsFile"
  ADD CONSTRAINT "MarketplaceCogsFile_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceCogsFile"
  ADD CONSTRAINT "MarketplaceCogsFile_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketplaceCogsItem"
  ADD CONSTRAINT "MarketplaceCogsItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceCogsItem"
  ADD CONSTRAINT "MarketplaceCogsItem_cogsFileId_fkey"
  FOREIGN KEY ("cogsFileId") REFERENCES "MarketplaceCogsFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceWeeklyMetricSnapshot"
  ADD CONSTRAINT "MarketplaceWeeklyMetricSnapshot_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceWeeklyMetricSnapshot"
  ADD CONSTRAINT "MarketplaceWeeklyMetricSnapshot_cogsFileId_fkey"
  FOREIGN KEY ("cogsFileId") REFERENCES "MarketplaceCogsFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
