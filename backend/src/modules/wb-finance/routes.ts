import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../lib/auth-hook.js'
import { decryptCredentials } from '../../lib/credentials.js'
import { prisma } from '../../lib/prisma.js'
import type { AuthenticatedRequest } from '../../types.js'

const fetchReportSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fields: z.array(z.string()).optional(),
}).refine(
  (data) => {
    const dateFrom = new Date(data.dateFrom)
    const dateTo = new Date(data.dateTo)
    const now = new Date()
    // Даты не должны быть в будущем
    return dateFrom <= now && dateTo <= now
  },
  {
    message: 'Dates must not be in the future',
    path: ['dateFrom'],
  },
).refine(
  (data) => {
    const dateFrom = new Date(data.dateFrom)
    const dateTo = new Date(data.dateTo)
    // dateTo должен быть >= dateFrom
    return dateTo >= dateFrom
  },
  {
    message: 'dateTo must be >= dateFrom',
    path: ['dateTo'],
  },
)

const wbFinanceResponseSchema = z.array(z.unknown())

type WbCredentials = {
  marketplace: 'wildberries'
  token: string
}

async function fetchWbFinanceReport(token: string, dateFrom: string, dateTo: string, fields?: string[]) {
  const requestBody: {
    dateFrom: string
    dateTo: string
    fields?: string[]
  } = {
    dateFrom,
    dateTo,
  }

  if (fields && fields.length > 0) {
    requestBody.fields = fields
  }

  const requestUrl = 'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed'

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`WB Finance API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return wbFinanceResponseSchema.parse(data)
  } catch (error) {
    if (error instanceof TypeError && error.message === 'fetch failed') {
      throw new Error('Failed to connect to Wildberries Finance API. Please check your network connection and API availability.')
    }
    throw error
  }
}

export async function wbFinanceRoutes(app: FastifyInstance): Promise<void> {
  app.post('/wb-finance/sales-reports/detailed', { preHandler: requireAuth }, async (request, reply) => {
    const { organizationId } = (request as AuthenticatedRequest).auth
    const body = fetchReportSchema.parse(request.body)

    // Get WB credentials
    const connection = await prisma.marketplaceConnection.findUnique({
      where: {
        organizationId_marketplace: {
          organizationId,
          marketplace: 'wildberries',
        },
      },
      select: {
        encryptedCredentials: true,
        status: true,
      },
    })

    if (!connection || connection.status !== 'connected' || !connection.encryptedCredentials) {
      return reply.code(404).send({
        error: 'Wildberries connection not found or not connected.',
      })
    }

    const credentials = decryptCredentials<WbCredentials>(connection.encryptedCredentials)

    try {
      app.log.info({
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        fieldsCount: body.fields?.length ?? 0,
      }, 'Fetching WB finance report')

      const reportData = await fetchWbFinanceReport(credentials.token, body.dateFrom, body.dateTo, body.fields)

      app.log.info({
        rowCount: reportData.length,
      }, 'Successfully fetched WB finance report')

      return {
        data: reportData,
        total: reportData.length,
        period: {
          dateFrom: body.dateFrom,
          dateTo: body.dateTo,
        },
      }
    } catch (error) {
      app.log.error({ error, errorMessage: error instanceof Error ? error.message : String(error) }, 'Failed to fetch WB finance report')
      return reply.code(502).send({
        error: 'Failed to fetch report from Wildberries Finance API.',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })
}
