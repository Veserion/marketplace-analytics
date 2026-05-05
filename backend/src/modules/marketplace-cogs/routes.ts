import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../lib/auth-hook.js'
import { prisma } from '../../lib/prisma.js'
import type { AuthenticatedRequest } from '../../types.js'
import { MarketplaceCogsService } from './service.js'

const marketplaceParamSchema = z.object({
  marketplace: z.enum(['ozon', 'wildberries']),
})

const uploadCogsSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  csvText: z.string().min(1),
})

async function requireCogsAdmin(userId: string, organizationId: string, reply: FastifyReply): Promise<boolean> {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    select: { role: true },
  })

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    await reply.code(403).send({ error: 'Only organization owners and admins can manage COGS files.' })
    return false
  }

  return true
}

export async function marketplaceCogsRoutes(app: FastifyInstance): Promise<void> {
  const cogsService = new MarketplaceCogsService(prisma)

  app.put('/marketplaces/:marketplace/cogs', { preHandler: requireAuth }, async (request, reply) => {
    const { organizationId, userId } = (request as AuthenticatedRequest).auth
    if (!(await requireCogsAdmin(userId, organizationId, reply))) return

    const params = marketplaceParamSchema.parse(request.params)
    const body = uploadCogsSchema.parse(request.body)

    try {
      const cogsFile = await cogsService.saveCogsFile({
        organizationId,
        userId,
        marketplace: params.marketplace,
        fileName: body.fileName,
        csvText: body.csvText,
      })

      return { cogsFile }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save COGS file.'
      const statusCode = message.includes('API key is required') ? 409 : 400
      return reply.code(statusCode).send({ error: message })
    }
  })

  app.get('/marketplaces/:marketplace/cogs', { preHandler: requireAuth }, async (request) => {
    const { organizationId } = (request as AuthenticatedRequest).auth
    const params = marketplaceParamSchema.parse(request.params)
    const cogsFile = await cogsService.getCogsMetadata(organizationId, params.marketplace)
    return { cogsFile }
  })

  app.get('/marketplaces/:marketplace/cogs/download', { preHandler: requireAuth }, async (request, reply) => {
    const { organizationId } = (request as AuthenticatedRequest).auth
    const params = marketplaceParamSchema.parse(request.params)
    const result = await cogsService.readCogsCsv(organizationId, params.marketplace)

    if (!result) {
      return reply.code(404).send({ error: 'COGS file not found.' })
    }

    return {
      fileName: result.fileName,
      csvText: result.csvText,
    }
  })

  app.delete('/marketplaces/:marketplace/cogs', { preHandler: requireAuth }, async (request, reply) => {
    const { organizationId, userId } = (request as AuthenticatedRequest).auth
    if (!(await requireCogsAdmin(userId, organizationId, reply))) return

    const params = marketplaceParamSchema.parse(request.params)
    await cogsService.deleteCogsFile(organizationId, params.marketplace)
    return { ok: true }
  })
}
