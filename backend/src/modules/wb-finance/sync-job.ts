import type { PrismaClient } from '@prisma/client'
import { WbReportStatus, WbReportType } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { decryptCredentials } from '../../lib/credentials.js'
import {
  assertMarketplaceRateLimitAvailable,
  recordMarketplaceRateLimit,
} from '../../lib/marketplace-rate-limit.js'
import type { WbCredentials } from './routes.js'
import {
  fetchWbApiWeeklyReport,
  WbApiRateLimitError,
} from './wb-api.js'
import {
  generateReportFileName,
  generateReportFilePath,
  getLastClosedWeek,
  getRequiredWbWeeklyPeriods,
  saveJsonFile,
  WB_DEFAULT_FIELDS,
} from './utils.js'
import path from 'path'

const WB_STORAGE_BASE_PATH = process.env.WB_STORAGE_PATH || path.join(process.env.HOME || '', 'storage', 'wb-reports')

/** How far back to pre-fetch: 1.5 months = ~45 days */
const PREFETCH_DAYS_BACK = 45

/** Extra seconds added to X-Ratelimit-Retry as a safety gap */
const RATE_LIMIT_GAP_SECONDS = 2

/** Interval between full sync cycles (ms) — 6 hours */
const SYNC_CYCLE_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Delay between different organizations to avoid bursts */
const INTER_ORG_DELAY_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface WeeklyReportData {
  periodFrom: string
  periodTo: string
  rowsCount: number
  rows: Record<string, unknown>[]
}

export class WbSyncJob {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(
    private prisma: PrismaClient,
    private app: FastifyInstance,
  ) {}

  /**
   * Start the recurring sync job. Runs first cycle after a short delay, then every SYNC_CYCLE_INTERVAL_MS.
   */
  start(): void {
    this.app.log.info('WB sync job: starting recurring background sync')
    this.timer = setTimeout(() => void this.runCycle(), 10_000)
  }

  /**
   * Stop the sync job.
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.app.log.info('WB sync job: stopped')
  }

  // ─── Cycle ──────────────────────────────────────────────────────────────

  private async runCycle(): Promise<void> {
    if (this.running) {
      this.app.log.warn('WB sync job: previous cycle still running, skipping')
      this.scheduleNext()
      return
    }

    this.running = true
    try {
      this.app.log.info('WB sync job: starting sync cycle')

      const connections = await this.prisma.marketplaceConnection.findMany({
        where: {
          marketplace: 'wildberries',
          status: 'connected',
          encryptedCredentials: { not: null },
        },
      })

      this.app.log.info({ orgCount: connections.length }, 'WB sync job: found connected organizations')

      for (const connection of connections) {
        try {
          await this.syncOrganization(connection.organizationId, connection.id, connection.encryptedCredentials!)
        } catch (error) {
          this.app.log.error({
            organizationId: connection.organizationId,
            error: error instanceof Error ? error.message : String(error),
          }, 'WB sync job: failed to sync organization')
        }

        // Small gap between orgs to avoid burst
        await sleep(INTER_ORG_DELAY_MS)
      }

      this.app.log.info('WB sync job: sync cycle completed')
    } catch (error) {
      this.app.log.error({ error: error instanceof Error ? error.message : String(error) }, 'WB sync job: cycle failed')
    } finally {
      this.running = false
      this.scheduleNext()
    }
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => void this.runCycle(), SYNC_CYCLE_INTERVAL_MS)
  }

  // ─── Per-organization sync ──────────────────────────────────────────────

  private async syncOrganization(organizationId: string, connectionId: string, encryptedCredentials: string): Promise<void> {
    const credentials = decryptCredentials<WbCredentials>(encryptedCredentials)
    const token = credentials.token

    // Determine the prefetch window: from (today - PREFETCH_DAYS_BACK) to last closed week
    const lastClosedWeek = getLastClosedWeek()
    if (!lastClosedWeek) {
      this.app.log.info({ organizationId }, 'WB sync job: no closed week yet, skipping')
      return
    }

    const prefetchFrom = new Date(lastClosedWeek.to)
    prefetchFrom.setDate(prefetchFrom.getDate() - PREFETCH_DAYS_BACK)
    prefetchFrom.setHours(0, 0, 0, 0)

    const requiredWeeks = getRequiredWbWeeklyPeriods(prefetchFrom, lastClosedWeek.to)

    this.app.log.info({
      organizationId,
      prefetchFrom: prefetchFrom.toISOString().split('T')[0],
      prefetchTo: lastClosedWeek.to.toISOString().split('T')[0],
      weeksCount: requiredWeeks.length,
    }, 'WB sync job: prefetch window')

    for (const week of requiredWeeks) {
      const dateFrom = week.from.toISOString().split('T')[0]
      const dateTo = week.to.toISOString().split('T')[0]

      // Check if report already exists and is ready
      const existing = await this.prisma.wbApiReport.findFirst({
        where: {
          organizationId,
          marketplace: 'wildberries',
          reportType: WbReportType.weekly_detailed,
          periodFrom: week.from,
          periodTo: week.to,
          deletedAt: null,
          status: WbReportStatus.ready,
        },
      })

      if (existing) {
        this.app.log.debug({ organizationId, dateFrom, dateTo }, 'WB sync job: week already cached, skipping')
        continue
      }

      this.app.log.info({ organizationId, dateFrom, dateTo }, 'WB sync job: fetching week from API')

      try {
        await this.fetchAndSaveWeek(organizationId, connectionId, week.from, week.to, token)
      } catch (error) {
        const rateLimit = error instanceof WbApiRateLimitError
          ? error.rateLimit
          : (error as Error & { rateLimit?: { retryAfter?: number; limit?: number; reset?: number } }).rateLimit

        if (rateLimit) {
          const retryAfter = (rateLimit.retryAfter ?? 5) + RATE_LIMIT_GAP_SECONDS
          this.app.log.warn({
            organizationId,
            dateFrom,
            dateTo,
            retryAfter,
            rateLimit,
          }, 'WB sync job: rate limited, waiting before retry')

          await sleep(retryAfter * 1000)

          // Retry once after waiting
          try {
            await this.fetchAndSaveWeek(organizationId, connectionId, week.from, week.to, token)
          } catch (retryError) {
            this.app.log.error({
              organizationId,
              dateFrom,
              dateTo,
              error: retryError instanceof Error ? retryError.message : String(retryError),
            }, 'WB sync job: retry failed for week, moving on')
          }
        } else {
          throw error
        }
      }
    }
  }

  // ─── Fetch & save a single week ─────────────────────────────────────────

  private async fetchAndSaveWeek(
    organizationId: string,
    connectionId: string,
    periodFrom: Date,
    periodTo: Date,
    token: string,
  ): Promise<void> {
    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    const dateFrom = formatDate(periodFrom)
    const dateTo = formatDate(periodTo)

    // Mark as processing (upsert)
    const existing = await this.prisma.wbApiReport.findFirst({
      where: {
        organizationId,
        marketplace: 'wildberries',
        reportType: WbReportType.weekly_detailed,
        periodFrom,
        periodTo,
        deletedAt: null,
      },
    })

    if (existing && existing.status === WbReportStatus.ready) {
      return // already cached (race condition guard)
    }

    const report = existing
      ? await this.prisma.wbApiReport.update({
          where: { id: existing.id },
          data: { status: WbReportStatus.processing },
        })
      : await this.prisma.wbApiReport.create({
          data: {
            organizationId,
            marketplace: 'wildberries',
            reportType: WbReportType.weekly_detailed,
            periodFrom,
            periodTo,
            status: WbReportStatus.processing,
          },
        })

    try {
      await assertMarketplaceRateLimitAvailable(this.prisma, {
        marketplace: 'wildberries',
        organizationId,
        marketplaceConnectionId: connectionId,
      })

      const rows = await fetchWbApiWeeklyReport(
        token,
        dateFrom,
        dateTo,
        WB_DEFAULT_FIELDS as readonly string[],
      )

      const reportData: WeeklyReportData = {
        periodFrom: dateFrom,
        periodTo: dateTo,
        rowsCount: rows.length,
        rows: rows as Record<string, unknown>[],
      }

      const fileName = generateReportFileName(periodFrom, periodTo)
      const filePath = generateReportFilePath(organizationId, report.id)
      const { size, hash } = await saveJsonFile(`${WB_STORAGE_BASE_PATH}${filePath}`, reportData)

      await this.prisma.wbApiReport.update({
        where: { id: report.id },
        data: {
          status: WbReportStatus.ready,
          rowsCount: rows.length,
          fileName,
          filePath,
          fileSize: BigInt(size),
          fileHash: hash,
        },
      })

      this.app.log.info({
        organizationId,
        dateFrom,
        dateTo,
        rowsCount: rows.length,
      }, 'WB sync job: week fetched and saved')
    } catch (error) {
      if (error instanceof WbApiRateLimitError) {
        await recordMarketplaceRateLimit(this.prisma, {
          marketplace: 'wildberries',
          organizationId,
          marketplaceConnectionId: connectionId,
        }, error.rateLimit ?? {})
      }

      await this.prisma.wbApiReport.update({
        where: { id: report.id },
        data: {
          status: WbReportStatus.error,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }
}
