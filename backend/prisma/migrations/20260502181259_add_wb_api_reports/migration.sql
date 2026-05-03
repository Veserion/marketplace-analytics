-- CreateEnum
CREATE TYPE "WbReportStatus" AS ENUM ('processing', 'ready', 'error');

-- CreateEnum
CREATE TYPE "WbReportType" AS ENUM ('weekly_detailed');

-- CreateTable
CREATE TABLE "WbApiReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'wildberries',
    "reportType" "WbReportType" NOT NULL DEFAULT 'weekly_detailed',
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "status" "WbReportStatus" NOT NULL DEFAULT 'processing',
    "errorMessage" TEXT,
    "rowsCount" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileSize" BIGINT,
    "fileHash" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'application/json',
    "requestedFields" JSONB NOT NULL DEFAULT '[]',
    "wbEndpoint" TEXT NOT NULL DEFAULT '/api/wb-finance/sales-reports/detailed',
    "requestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refreshedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WbApiReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_wb_api_reports_company_period" ON "WbApiReport"("organizationId", "periodFrom", "periodTo");

-- CreateIndex
CREATE INDEX "idx_wb_api_reports_company_status" ON "WbApiReport"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WbApiReport_organizationId_marketplace_reportType_periodFro_key" ON "WbApiReport"("organizationId", "marketplace", "reportType", "periodFrom", "periodTo");

-- AddForeignKey
ALTER TABLE "WbApiReport" ADD CONSTRAINT "WbApiReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbApiReport" ADD CONSTRAINT "WbApiReport_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
