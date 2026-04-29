import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../lib/auth-hook.js'
import { prisma } from '../../lib/prisma.js'
import type { AuthenticatedRequest } from '../../types.js'

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    const { userId, organizationId } = (request as AuthenticatedRequest).auth
    const membership = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        userId_organizationId: { userId, organizationId },
      },
      select: {
        role: true,
        user: {
          select: { id: true, email: true, name: true, createdAt: true },
        },
        organization: {
          select: { id: true, name: true, createdAt: true },
        },
      },
    })

    return {
      user: membership.user,
      organization: membership.organization,
      role: membership.role,
    }
  })
}
