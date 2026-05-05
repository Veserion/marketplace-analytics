import type { FastifyInstance } from 'fastify'
import type { Marketplace } from '@prisma/client'
import { StoredArtifactStatus } from '@prisma/client'
import { z } from 'zod'
import { requireAuth } from '../../lib/auth-hook.js'
import { prisma } from '../../lib/prisma.js'
import type { AuthenticatedRequest } from '../../types.js'
import { MarketplaceCogsService } from '../marketplace-cogs/service.js'
import { WbReportService } from '../wb-finance/report-service.js'
import { getRequiredWbWeeklyPeriods } from '../wb-finance/utils.js'
import {
  buildWbReportGroupsFromCombined,
  calculateWbMetrics,
  combineAtoms,
  createRequestHash,
  getWbMetricFields,
  mapWbApiRowToAccrualRow,
  type WbMetricAtoms,
  type WbMetricBreakdowns,
  type WbMetricFilters,
  type WbMetricParams,
} from './wb-calculator.js'

const CALCULATOR_VERSION = 'wb-accrual-v3'

const marketplaceParamSchema = z.object({
  marketplace: z.enum(['ozon', 'wildberries']),
})

const metricsRequestSchema = z.object({
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  filters: z.object({
    articlePattern: z.string().default('*'),
    excludeArticlePattern: z.boolean().default(false),
    priceMin: z.number().nullable().default(null),
    priceMax: z.number().nullable().default(null),
  }).optional().default({
    articlePattern: '*',
    excludeArticlePattern: false,
    priceMin: null,
    priceMax: null,
  }),
  params: z.object({
    vatRatePercent: z.number().default(5),
    taxRatePercent: z.number().default(6),
    cogsMatchingMode: z.enum(['full', 'digits']).default('full'),
  }).optional().default({
    vatRatePercent: 5,
    taxRatePercent: 6,
    cogsMatchingMode: 'full',
  }),
})

type WeeklyMetrics = {
  periodFrom: Date
  periodTo: Date
  rowsCount: number
  atoms: WbMetricAtoms
  breakdowns: WbMetricBreakdowns
  dataQuality: {
    cogsMatchedRows: number
    missingCogsArticles: string[]
    warnings: string[]
  }
  snapshotId: string
  cache: 'hit' | 'miss'
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function toDateOnly(value: Date): string {
  return value.toISOString().split('T')[0]
}

function createEmptyBreakdowns(): WbMetricBreakdowns {
  return {
    expenses: [],
    salesScheme: [],
    dailyDynamics: [],
    reasonStructure: [],
  }
}

function mergeBreakdowns(weekly: WeeklyMetrics[]): WbMetricBreakdowns {
  const merged = createEmptyBreakdowns()
  for (const item of weekly) {
    merged.expenses.push(...item.breakdowns.expenses)
    merged.salesScheme.push(...item.breakdowns.salesScheme)
    merged.dailyDynamics.push(...item.breakdowns.dailyDynamics)
    merged.reasonStructure.push(...item.breakdowns.reasonStructure)
  }
  return merged
}

async function getOrCalculateWbWeek(input: {
  app: FastifyInstance
  reportService: WbReportService
  cogsService: MarketplaceCogsService
  organizationId: string
  userId: string
  periodFrom: Date
  periodTo: Date
  filters: WbMetricFilters
  params: WbMetricParams
  cogsFileId: string | null
  cogsHash: string
  costByKey: Map<string, number>
  requestHash: string
}): Promise<WeeklyMetrics> {
  const reportType = `weekly_detailed:${input.requestHash}`
  const existing = await prisma.marketplaceWeeklyMetricSnapshot.findUnique({
    where: {
      uniq_marketplace_weekly_metric_snapshot: {
        organizationId: input.organizationId,
        marketplace: 'wildberries',
        reportType,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        cogsHash: input.cogsHash,
        calculatorVersion: CALCULATOR_VERSION,
      },
    },
  })

  if (existing?.status === StoredArtifactStatus.ready) {
    return {
      periodFrom: existing.periodFrom,
      periodTo: existing.periodTo,
      rowsCount: existing.rowsCount,
      atoms: existing.atoms as unknown as WbMetricAtoms,
      breakdowns: existing.breakdowns as unknown as WbMetricBreakdowns,
      dataQuality: existing.dataQuality as WeeklyMetrics['dataQuality'],
      snapshotId: existing.id,
      cache: 'hit',
    }
  }

  const snapshot = existing
    ? await prisma.marketplaceWeeklyMetricSnapshot.update({
        where: { id: existing.id },
        data: {
          status: StoredArtifactStatus.processing,
          errorMessage: null,
        },
      })
    : await prisma.marketplaceWeeklyMetricSnapshot.create({
        data: {
          organizationId: input.organizationId,
          marketplace: 'wildberries',
          reportType,
          periodFrom: input.periodFrom,
          periodTo: input.periodTo,
          cogsFileId: input.cogsFileId,
          cogsHash: input.cogsHash,
          calculatorVersion: CALCULATOR_VERSION,
          status: StoredArtifactStatus.processing,
        },
      })

  try {
    const report = await input.reportService.getDetailedReports(
      input.userId,
      input.organizationId,
      input.periodFrom,
      input.periodTo,
      getWbMetricFields(),
    )
    const rows = (report.rows as Record<string, unknown>[]).map(mapWbApiRowToAccrualRow)
    const metrics = calculateWbMetrics({
      rows,
      filters: input.filters,
      params: input.params,
      costByKey: input.costByKey,
    })

    await prisma.marketplaceWeeklyMetricSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: StoredArtifactStatus.ready,
        atoms: metrics.atoms,
        molecules: metrics.molecules,
        cells: metrics.cells,
        breakdowns: metrics.breakdowns,
        dataQuality: metrics.dataQuality,
        rowsCount: metrics.rowCount,
        calculatedAt: new Date(),
      },
    })

    return {
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      rowsCount: metrics.rowCount,
      atoms: metrics.atoms,
      breakdowns: metrics.breakdowns,
      dataQuality: metrics.dataQuality,
      snapshotId: snapshot.id,
      cache: 'miss',
    }
  } catch (error) {
    await prisma.marketplaceWeeklyMetricSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: StoredArtifactStatus.error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}

export async function marketplaceMetricsRoutes(app: FastifyInstance): Promise<void> {
  const cogsService = new MarketplaceCogsService(prisma)
  const wbReportService = new WbReportService(prisma, app)

  app.post('/marketplaces/:marketplace/metrics/accrual', { preHandler: requireAuth }, async (request, reply) => {
    const { organizationId, userId } = (request as AuthenticatedRequest).auth
    const params = marketplaceParamSchema.parse(request.params)
    const body = metricsRequestSchema.parse(request.body)

    if (params.marketplace !== 'wildberries') {
      return reply.code(501).send({ error: 'Backend metrics for this marketplace are not implemented yet.' })
    }

    const periodFrom = parseDate(body.periodFrom)
    const periodTo = parseDate(body.periodTo)
    if (periodTo < periodFrom) {
      return reply.code(400).send({ error: 'periodTo must be >= periodFrom.' })
    }

    const filters: WbMetricFilters = {
      articlePattern: body.filters.articlePattern,
      excludeArticlePattern: body.filters.excludeArticlePattern,
      priceMin: body.filters.priceMin,
      priceMax: body.filters.priceMax,
    }
    const metricParams: WbMetricParams = {
      vatRatePercent: body.params.vatRatePercent,
      taxRatePercent: body.params.taxRatePercent,
      cogsMatchingMode: body.params.cogsMatchingMode,
    }

    await cogsService.assertConnectedMarketplace(organizationId, params.marketplace as Marketplace)
    const cogs = await cogsService.getCogsCostMap(organizationId, params.marketplace as Marketplace, metricParams.cogsMatchingMode)
    const requestHash = createRequestHash({ filters, params: metricParams })
    const weeks = getRequiredWbWeeklyPeriods(periodFrom, periodTo)

    const weeklyMetrics: WeeklyMetrics[] = []
    for (const week of weeks) {
      weeklyMetrics.push(await getOrCalculateWbWeek({
        app,
        reportService: wbReportService,
        cogsService,
        organizationId,
        userId,
        periodFrom: week.from,
        periodTo: week.to,
        filters,
        params: metricParams,
        cogsFileId: cogs.cogsFileId,
        cogsHash: cogs.cogsHash,
        costByKey: cogs.costByKey,
        requestHash,
      }))
    }

    const atoms = combineAtoms(weeklyMetrics.map((item) => item.atoms))
    const breakdowns = mergeBreakdowns(weeklyMetrics)
    const rowCount = weeklyMetrics.reduce((sum, item) => sum + item.rowsCount, 0)
    const derived = buildWbReportGroupsFromCombined({
      rowCount,
      atoms,
      params: metricParams,
      breakdowns,
    })
    const missingCogsArticles = Array.from(new Set(weeklyMetrics.flatMap((item) => item.dataQuality.missingCogsArticles))).sort((a, b) => a.localeCompare(b, 'ru'))
    const warnings = Array.from(new Set(weeklyMetrics.flatMap((item) => item.dataQuality.warnings)))

    return {
      marketplace: params.marketplace,
      requestedPeriod: {
        from: body.periodFrom,
        to: body.periodTo,
      },
      availablePeriod: {
        from: body.periodFrom,
        to: body.periodTo,
      },
      source: {
        weeklyReports: weeklyMetrics.map((item) => ({
          snapshotId: item.snapshotId,
          periodFrom: toDateOnly(item.periodFrom),
          periodTo: toDateOnly(item.periodTo),
          metricsCache: item.cache,
        })),
        cogsFileId: cogs.cogsFileId,
        cogsHash: cogs.cogsHash,
        calculatorVersion: CALCULATOR_VERSION,
      },
      rowCount,
      atoms,
      molecules: derived.molecules,
      cells: derived.cells,
      breakdowns,
      dataQuality: {
        cogsMatchedRows: atoms.cogsMatchedRows,
        missingCogsArticles,
        warnings,
      },
      reportGroups: derived.reportGroups,
    }
  })
}
