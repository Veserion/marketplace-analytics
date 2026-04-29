import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyAuthToken } from './jwt.js'
import { prisma } from './prisma.js'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  if (!token) {
    await reply.code(401).send({ error: 'Authorization token is required.' })
    return
  }

  try {
    const payload = await verifyAuthToken(token)
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: payload.userId,
          organizationId: payload.organizationId,
        },
      },
      select: { id: true },
    })

    if (!membership) {
      await reply.code(403).send({ error: 'Organization access denied.' })
      return
    }

    Object.assign(request, { auth: payload })
  } catch {
    await reply.code(401).send({ error: 'Invalid authorization token.' })
  }
}
