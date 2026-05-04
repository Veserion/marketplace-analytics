import type { PrismaClient } from '@prisma/client'
import { WbReportStatus, WbReportType } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { decryptCredentials } from '../../lib/credentials.js'
import type { WbCredentials } from './routes.js'
import {
  fetchWbApiWeeklyReport,
  WbApiRateLimitError,
  type WbApiReportRow,
} from './wb-api.js'
import {
  dedupeRows,
  generateReportFileName,
  generateReportFilePath,
  getRequiredWbWeeklyPeriods,
  getLastClosedWeek,
  pick,
  readJsonFile,
  saveJsonFile,
  WB_DEFAULT_FIELDS,
} from './utils.js'
import { promises as fs } from 'fs'
import path from 'path'

// Production: /storage/wb-reports
// Development: ~/storage/wb-reports
const WB_STORAGE_BASE_PATH = process.env.WB_STORAGE_PATH || path.join(process.env.HOME || '', 'storage', 'wb-reports')

/**
 * Ensure the storage directory exists.
 */
async function ensureStorageDirectory(): Promise<void> {
  try {
    await fs.mkdir(WB_STORAGE_BASE_PATH, { recursive: true })
  } catch (error) {
    console.error('Failed to create storage directory:', error)
    throw error
  }
}

interface WeeklyReportData {
  periodFrom: string
  periodTo: string
  rowsCount: number
  rows: Record<string, unknown>[]
}

interface LoadedWeeklyReport {
  id: string
  periodFrom: Date
  periodTo: Date
  source: 'cache' | 'api'
  filePath: string
}

export class WbReportService {
  constructor(
    private prisma: PrismaClient,
    private app: FastifyInstance,
  ) {
    // Ensure storage directory exists on startup
    ensureStorageDirectory()
  }

  /**
   * Get the organization ID for the current user.
   */
  private async getOrganizationId(userId: string): Promise<string> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
    })

    if (memberships.length === 0) {
      throw new Error('User is not a member of any organization')
    }

    if (memberships.length === 1) {
      return memberships[0].organizationId
    }

    // If multiple organizations, we need to determine which one is active
    // For now, return the first one (this should be improved based on business logic)
    return memberships[0].organizationId
  }

  /**
   * Get WB credentials for an organization.
   */
  private async getWbCredentials(organizationId: string): Promise<WbCredentials> {
    const connection = await this.prisma.marketplaceConnection.findUnique({
      where: {
        organizationId_marketplace: {
          organizationId,
          marketplace: 'wildberries',
        },
      },
    })

    if (!connection || connection.status !== 'connected' || !connection.encryptedCredentials) {
      throw new Error('Wildberries connection not found or not connected')
    }

    return decryptCredentials<WbCredentials>(connection.encryptedCredentials)
  }

  /**
   * Check if a weekly report exists in the database.
   */
  private async findWeeklyReport(
    organizationId: string,
    periodFrom: Date,
    periodTo: Date,
  ) {
    return this.prisma.wbApiReport.findFirst({
      where: {
        organizationId,
        marketplace: 'wildberries',
        reportType: WbReportType.weekly_detailed,
        periodFrom,
        periodTo,
        deletedAt: null,
      },
    })
  }

  /**
   * Load a weekly report from WB API and save it.
   */
  private async loadWeeklyReportFromApi(
    organizationId: string,
    periodFrom: Date,
    periodTo: Date,
    token: string,
    userId: string,
  ): Promise<LoadedWeeklyReport> {
    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    const dateFrom = formatDate(periodFrom)
    const dateTo = formatDate(periodTo)

    // Check if report already exists (regardless of status)
    const existingReport = await this.prisma.wbApiReport.findFirst({
      where: {
        organizationId,
        marketplace: 'wildberries',
        reportType: WbReportType.weekly_detailed,
        periodFrom,
        periodTo,
        deletedAt: null,
      },
    })

    if (existingReport) {
      if (existingReport.status === WbReportStatus.ready) {
        this.app.log.info({
          userId,
          organizationId,
          reportId: existingReport.id,
          dateFrom,
          dateTo,
          status: existingReport.status,
        }, 'Report already exists and is ready, loading from cache')
        return this.loadWeeklyReportFromCache(
          existingReport.id,
          existingReport.filePath || '',
          existingReport.periodFrom,
          existingReport.periodTo,
        )
      } else if (existingReport.status === WbReportStatus.processing) {
        // Check if the report has been processing for too long (more than 10 minutes)
        const processingTime = Date.now() - existingReport.updatedAt.getTime()
        const timeoutMs = 10 * 60 * 1000 // 10 minutes

        if (processingTime > timeoutMs) {
          this.app.log.warn({
            userId,
            organizationId,
            reportId: existingReport.id,
            dateFrom,
            dateTo,
            status: existingReport.status,
            processingTimeMs: processingTime,
          }, 'Report has been processing for too long, resetting to error and retrying')
          await this.prisma.wbApiReport.update({
            where: { id: existingReport.id },
            data: {
              status: WbReportStatus.error,
              errorMessage: 'Processing timeout - report was stuck in processing status',
            },
          })
          // Continue to retry as error status
        } else {
          this.app.log.warn({
            userId,
            organizationId,
            reportId: existingReport.id,
            dateFrom,
            dateTo,
            status: existingReport.status,
            processingTimeMs: processingTime,
          }, 'Report is currently being processed by another request')
          throw new Error(`Report for period ${dateFrom} - ${dateTo} is currently being processed. Please try again later.`)
        }
      } else {
        // Status is 'error', update it to processing and retry
        this.app.log.info({
          userId,
          organizationId,
          reportId: existingReport.id,
          dateFrom,
          dateTo,
          status: existingReport.status,
        }, 'Report exists with error status, retrying')
        await this.prisma.wbApiReport.update({
          where: { id: existingReport.id },
          data: { status: WbReportStatus.processing },
        })
      }
    }

    this.app.log.info({
      userId,
      organizationId,
      dateFrom,
      dateTo,
    }, 'Loading weekly report from WB API (not found in cache)')

    try {
      // Fetch all rows from WB API with pagination
      const rows = await fetchWbApiWeeklyReport(
        token,
        dateFrom,
        dateTo,
        WB_DEFAULT_FIELDS as readonly string[],
      )

      this.app.log.info({
        userId,
        organizationId,
        dateFrom,
        dateTo,
        rowsCount: rows.length,
      }, 'Successfully fetched rows from WB API')

      // Create report data
      const reportData: WeeklyReportData = {
        periodFrom: dateFrom,
        periodTo: dateTo,
        rowsCount: rows.length,
        rows: rows as Record<string, unknown>[],
      }

      // Create or update database record
      const report = existingReport
        ? await this.prisma.wbApiReport.update({
            where: { id: existingReport.id },
            data: {
              status: WbReportStatus.processing,
              requestedByUserId: userId,
            },
          })
        : await this.prisma.wbApiReport.create({
            data: {
              organizationId,
              marketplace: 'wildberries',
              reportType: WbReportType.weekly_detailed,
              periodFrom,
              periodTo,
              status: WbReportStatus.processing,
              requestedByUserId: userId,
            },
          })

      this.app.log.info({
        userId,
        organizationId,
        reportId: report.id,
        dateFrom,
        dateTo,
      }, 'Created database record for weekly report')

      // Generate file path
      const fileName = generateReportFileName(periodFrom, periodTo)
      const filePath = generateReportFilePath(organizationId, report.id)

      // Save JSON file
      const { size, hash } = await saveJsonFile(`${WB_STORAGE_BASE_PATH}${filePath}`, reportData)

      this.app.log.info({
        userId,
        organizationId,
        reportId: report.id,
        dateFrom,
        dateTo,
        fileName,
        filePath,
        fileSize: size,
        fileHash: hash,
      }, 'Successfully saved weekly report to file')

      // Update database record with file info
      const updatedReport = await this.prisma.wbApiReport.update({
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
        userId,
        organizationId,
        reportId: report.id,
        dateFrom,
        dateTo,
        rowsCount: rows.length,
        status: 'ready',
      }, 'Weekly report marked as ready')

      return {
        id: report.id,
        periodFrom: updatedReport.periodFrom,
        periodTo: updatedReport.periodTo,
        source: 'api',
        filePath: `${WB_STORAGE_BASE_PATH}${filePath}`,
      }
    } catch (error) {
      this.app.log.error({
        userId,
        organizationId,
        dateFrom,
        dateTo,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      }, 'Failed to load weekly report from WB API')

      // If it's a rate limit error, add rate limit info to the error
      if (error instanceof WbApiRateLimitError) {
        const rateLimitError = new Error(error.message) as Error & { rateLimit?: typeof error.rateLimit }
        rateLimitError.rateLimit = error.rateLimit
        throw rateLimitError
      }

      throw error
    }
  }

  /**
   * Load a weekly report from cache (file).
   */
  private async loadWeeklyReportFromCache(
    reportId: string,
    filePath: string,
    periodFrom: Date,
    periodTo: Date,
  ): Promise<LoadedWeeklyReport> {
    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    let fullPath: string

    // Handle different path formats from database
    if (filePath.startsWith('/storage/wb-reports/') || filePath.startsWith('/storage/wb-reports')) {
      // Old production path: /storage/wb-reports/{companyId}/{reportId}.json
      // Use the current WB_STORAGE_BASE_PATH (which is /storage/wb-reports in production)
      const relativePath = filePath.replace('/storage/wb-reports', '')
      fullPath = path.join(WB_STORAGE_BASE_PATH, relativePath)
    } else if (filePath.startsWith('./storage/wb-reports/')) {
      // Old relative path: ./storage/wb-reports/{companyId}/{reportId}.json
      const relativePath = filePath.replace('./storage/wb-reports', '')
      fullPath = path.join(WB_STORAGE_BASE_PATH, relativePath)
    } else if (filePath.startsWith('/') && filePath.split('/').length > 3) {
      // Full absolute path (e.g., /Users/lobanovdaniil/storage/...)
      fullPath = filePath
    } else if (filePath.startsWith('/')) {
      // Relative path starting with / (e.g., /companyId/reportId.json)
      // This is not a full path, treat as relative
      const relativePath = filePath.startsWith('/') ? filePath.slice(1) : filePath
      fullPath = path.join(WB_STORAGE_BASE_PATH, relativePath)
    } else {
      // Relative path without leading /
      fullPath = path.join(WB_STORAGE_BASE_PATH, filePath)
    }

    this.app.log.info({
      reportId,
      dateFrom: formatDate(periodFrom),
      dateTo: formatDate(periodTo),
      originalFilePath: filePath,
      fullPath,
    }, 'Loading weekly report from cache (found in database)')

    return {
      id: reportId,
      periodFrom,
      periodTo,
      source: 'cache',
      filePath: fullPath,
    }
  }

  /**
   * Get or load weekly reports for a period range.
   */
  private async getOrLoadWeeklyReports(
    organizationId: string,
    periodFrom: Date,
    periodTo: Date,
    token: string,
    userId: string,
  ): Promise<LoadedWeeklyReport[]> {
    const requiredWeeks = getRequiredWbWeeklyPeriods(periodFrom, periodTo)
    const reports: LoadedWeeklyReport[] = []

    for (const week of requiredWeeks) {
      // Check if report exists in database
      const existingReport = await this.findWeeklyReport(organizationId, week.from, week.to)

      if (existingReport && existingReport.filePath) {
        // Load from cache
        reports.push(
          await this.loadWeeklyReportFromCache(
            existingReport.id,
            existingReport.filePath,
            existingReport.periodFrom,
            existingReport.periodTo,
          ),
        )
      } else {
        // Load from API
        reports.push(
          await this.loadWeeklyReportFromApi(organizationId, week.from, week.to, token, userId),
        )
      }
    }

    return reports
  }

  /**
   * Get detailed sales reports for a user period.
   */
  async getDetailedReports(
    userId: string,
    periodFrom: Date,
    periodTo: Date,
    fields: string[],
  ) {
    const organizationId = await this.getOrganizationId(userId)
    const credentials = await this.getWbCredentials(organizationId)

    // Get last closed week to check if requested period is available
    const lastClosedWeek = getLastClosedWeek()

    // Check if part of the requested period is not yet available
    let availablePeriodFrom = periodFrom
    let availablePeriodTo = periodTo
    let missingPeriodFrom: Date | null = null
    let missingPeriodTo: Date | null = null
    let warning: string | null = null

    if (lastClosedWeek && periodTo > lastClosedWeek.to) {
      availablePeriodTo = lastClosedWeek.to
      missingPeriodFrom = new Date(lastClosedWeek.to)
      missingPeriodFrom.setDate(missingPeriodFrom.getDate() + 1)
      missingPeriodTo = periodTo
      warning = 'WB ещё не сформировал финансовый отчёт за часть выбранного периода.'
    }

    // Get or load weekly reports
    const weeklyReports = await this.getOrLoadWeeklyReports(
      organizationId,
      availablePeriodFrom,
      availablePeriodTo,
      credentials.token,
      userId,
    )

    this.app.log.info({
      userId,
      organizationId,
      requestedPeriod: {
        from: periodFrom.toISOString().split('T')[0],
        to: periodTo.toISOString().split('T')[0],
      },
      availablePeriod: {
        from: availablePeriodFrom.toISOString().split('T')[0],
        to: availablePeriodTo.toISOString().split('T')[0],
      },
      loadedWeeklyReports: weeklyReports.map((r) => ({
        id: r.id,
        periodFrom: r.periodFrom.toISOString().split('T')[0],
        periodTo: r.periodTo.toISOString().split('T')[0],
        source: r.source,
      })),
    }, 'Weekly reports loaded for request')

    // Read all weekly report files and merge rows
    const allRows: Record<string, unknown>[] = []
    for (const report of weeklyReports) {
      const data = await readJsonFile<WeeklyReportData>(report.filePath)
      this.app.log.info({
        reportId: report.id,
        periodFrom: report.periodFrom.toISOString().split('T')[0],
        periodTo: report.periodTo.toISOString().split('T')[0],
        source: report.source,
        rowsCount: data.rowsCount,
      }, 'Merging rows from weekly report')
      allRows.push(...data.rows)
    }

    this.app.log.info({
      userId,
      totalRowsBeforeDedupe: allRows.length,
    }, 'Rows merged from weekly reports')

    // Deduplicate rows
    const dedupedRows = dedupeRows(allRows)

    this.app.log.info({
      userId,
      totalRowsAfterDedupe: dedupedRows.length,
      dedupedCount: allRows.length - dedupedRows.length,
    }, 'Rows deduplicated')

    // Filter rows by user period
    const userPeriodFromStr = periodFrom.toISOString().split('T')[0]
    const userPeriodToStr = availablePeriodTo.toISOString().split('T')[0]

    const filteredRows = dedupedRows.filter((row: any) => {
      const rawDate = row.rrDate || row.saleDt || row.orderDt
      if (!rawDate) return false
      // API dates may come as ISO strings (e.g. "2024-03-15T00:00:00"),
      // extract date-only part for correct string comparison with YYYY-MM-DD boundaries
      const rowDate = String(rawDate).slice(0, 10)
      return rowDate >= userPeriodFromStr && rowDate <= userPeriodToStr
    })

    // Filter to requested fields
    const responseRows = filteredRows.map((row) => pick(row, fields as any))

    this.app.log.info({
      userId,
      organizationId,
      requestedPeriod: {
        from: periodFrom.toISOString().split('T')[0],
        to: periodTo.toISOString().split('T')[0],
      },
      availablePeriod: {
        from: availablePeriodFrom.toISOString().split('T')[0],
        to: availablePeriodTo.toISOString().split('T')[0],
      },
      ...(missingPeriodFrom && missingPeriodTo && {
        missingPeriod: {
          from: missingPeriodFrom.toISOString().split('T')[0],
          to: missingPeriodTo.toISOString().split('T')[0],
        },
      }),
      ...(warning && { warning }),
      loadedWeeklyReports: weeklyReports.map((report) => ({
        id: report.id,
        periodFrom: report.periodFrom.toISOString().split('T')[0],
        periodTo: report.periodTo.toISOString().split('T')[0],
        source: report.source,
      })),
      rowsBeforeFilter: dedupedRows.length,
      rowsAfterFilter: filteredRows.length,
      rowsAfterFieldFilter: responseRows.length,
      requestedFields: fields,
    }, 'Final report assembled and ready to send to frontend')

    return {
      requestedPeriod: {
        from: periodFrom.toISOString().split('T')[0],
        to: periodTo.toISOString().split('T')[0],
      },
      availablePeriod: {
        from: availablePeriodFrom.toISOString().split('T')[0],
        to: availablePeriodTo.toISOString().split('T')[0],
      },
      ...(missingPeriodFrom && missingPeriodTo && {
        missingPeriod: {
          from: missingPeriodFrom.toISOString().split('T')[0],
          to: missingPeriodTo.toISOString().split('T')[0],
        },
      }),
      ...(warning && { warning }),
      loadedWeeklyReports: weeklyReports.map((report) => ({
        id: report.id,
        periodFrom: report.periodFrom.toISOString().split('T')[0],
        periodTo: report.periodTo.toISOString().split('T')[0],
        source: report.source,
      })),
      rowsCount: responseRows.length,
      fields,
      rows: responseRows,
    }
  }

  /**
   * Get list of saved weekly reports for an organization.
   */
  async getSavedReports(userId: string) {
    const organizationId = await this.getOrganizationId(userId)

    const reports = await this.prisma.wbApiReport.findMany({
      where: {
        organizationId,
        marketplace: 'wildberries',
        reportType: WbReportType.weekly_detailed,
        deletedAt: null,
      },
      orderBy: {
        periodFrom: 'desc',
      },
    })

    return reports.map((report: any) => ({
      id: report.id,
      periodFrom: report.periodFrom.toISOString().split('T')[0],
      periodTo: report.periodTo.toISOString().split('T')[0],
      rowsCount: report.rowsCount,
      status: report.status,
      fileName: report.fileName,
      createdAt: report.createdAt.toISOString(),
      refreshedAt: report.refreshedAt?.toISOString() ?? null,
    }))
  }
}
