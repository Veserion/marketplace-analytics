import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { decryptCredentials } from '../../lib/credentials.js'
import { requireAuth } from '../../lib/auth-hook.js'
import { WbReportService } from './report-service.js'

interface AuthenticatedRequest extends FastifyRequest {
  auth: {
    userId: string
    organizationId: string
  }
}

export type WbCredentials = {
  marketplace: 'wildberries'
  token: string
}

const fetchReportSchema = z.object({
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fields: z.array(z.string()).optional(),
}).refine(
  (data) => {
    const dateFrom = new Date(data.periodFrom)
    const dateTo = new Date(data.periodTo)
    const now = new Date()
    // Даты не должны быть в будущем
    return dateFrom <= now && dateTo <= now
  },
  {
    message: 'Dates must not be in the future',
    path: ['periodFrom'],
  },
).refine(
  (data) => {
    const dateFrom = new Date(data.periodFrom)
    const dateTo = new Date(data.periodTo)
    // dateTo должен быть >= dateFrom
    return dateTo >= dateFrom
  },
  {
    message: 'dateTo must be >= dateFrom',
    path: ['periodTo'],
  },
)

export async function wbFinanceRoutes(app: FastifyInstance): Promise<void> {
  const reportService = new WbReportService(prisma, app)

  app.post('/wb-finance/sales-reports/detailed', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).auth
    const body = fetchReportSchema.parse(request.body)

    try {
      const periodFrom = new Date(body.periodFrom)
      const periodTo = new Date(body.periodTo)
      const fields = body.fields ?? []

      app.log.info({
        userId,
        periodFrom: body.periodFrom,
        periodTo: body.periodTo,
        fieldsCount: fields.length,
      }, 'Fetching WB finance report with caching')

      const result = await reportService.getDetailedReports(userId, periodFrom, periodTo, fields)

      app.log.info({
        userId,
        rowsCount: result.rowsCount,
        loadedWeeklyReports: result.loadedWeeklyReports.length,
      }, 'Successfully fetched WB finance report')

      return result
    } catch (error) {
      app.log.error({ error, errorMessage: error instanceof Error ? error.message : String(error) }, 'Failed to fetch WB finance report')

      // Check if it's a rate limit error
      const errorWithRateLimit = error as Error & { rateLimit?: { retryAfter?: number; limit?: number; reset?: number } }
      if (errorWithRateLimit.rateLimit) {
        return reply.code(429).send({
          error: 'Rate limit exceeded for Wildberries Finance API.',
          message: errorWithRateLimit.message,
          rateLimit: errorWithRateLimit.rateLimit,
        })
      }

      return reply.code(502).send({
        error: 'Failed to fetch report from Wildberries Finance API.',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.get('/wb-finance/sales-reports', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).auth

    try {
      const reports = await reportService.getSavedReports(userId)
      return reports
    } catch (error) {
      app.log.error({ error, errorMessage: error instanceof Error ? error.message : String(error) }, 'Failed to fetch saved WB reports')
      return reply.code(500).send({
        error: 'Failed to fetch saved reports.',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })
}
