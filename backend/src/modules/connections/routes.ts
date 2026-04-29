import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../lib/auth-hook.js'
import {
  encryptCredentials,
  getCredentialKeyVersion,
  maskSecret,
} from '../../lib/credentials.js'
import { prisma } from '../../lib/prisma.js'
import type { AuthenticatedRequest } from '../../types.js'

const marketplaceParamSchema = z.object({
  marketplace: z.enum(['ozon', 'wildberries']),
})

const credentialsSchema = z.discriminatedUnion('marketplace', [
  z.object({
    marketplace: z.literal('ozon'),
    clientId: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
  }),
  z.object({
    marketplace: z.literal('wildberries'),
    token: z.string().trim().min(1),
  }),
])

function getPreview(credentials: z.infer<typeof credentialsSchema>): string {
  if (credentials.marketplace === 'ozon') {
    return `Client ID ${maskSecret(credentials.clientId)}, API Key ${maskSecret(credentials.apiKey)}`
  }

  return `Token ${maskSecret(credentials.token)}`
}

export async function connectionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/marketplace-connections', { preHandler: requireAuth }, async (request) => {
    const { organizationId } = (request as AuthenticatedRequest).auth
    const connections = await prisma.marketplaceConnection.findMany({
      where: { organizationId },
      orderBy: { marketplace: 'asc' },
      select: {
        id: true,
        marketplace: true,
        status: true,
        credentialPreview: true,
        lastCheckedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return { connections }
  })

  app.put('/marketplace-connections/:marketplace/credentials', { preHandler: requireAuth }, async (request, reply) => {
    const { organizationId, userId } = (request as AuthenticatedRequest).auth
    const params = marketplaceParamSchema.parse(request.params)
    const credentials = credentialsSchema.parse({
      ...(request.body as Record<string, unknown>),
      marketplace: params.marketplace,
    })

    const connection = await prisma.marketplaceConnection.upsert({
      where: {
        organizationId_marketplace: {
          organizationId,
          marketplace: credentials.marketplace,
        },
      },
      create: {
        organizationId,
        marketplace: credentials.marketplace,
        status: 'connected',
        encryptedCredentials: encryptCredentials(credentials),
        credentialPreview: getPreview(credentials),
        encryptionKeyVersion: getCredentialKeyVersion(),
      },
      update: {
        status: 'connected',
        encryptedCredentials: encryptCredentials(credentials),
        credentialPreview: getPreview(credentials),
        encryptionKeyVersion: getCredentialKeyVersion(),
      },
      select: {
        id: true,
        marketplace: true,
        status: true,
        credentialPreview: true,
        updatedAt: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        action: 'credentials_saved',
        userId,
        organizationId,
        metadata: { marketplace: credentials.marketplace },
      },
    })

    return reply.code(200).send({ connection })
  })

  app.delete('/marketplace-connections/:marketplace/credentials', { preHandler: requireAuth }, async (request) => {
    const { organizationId, userId } = (request as AuthenticatedRequest).auth
    const params = marketplaceParamSchema.parse(request.params)

    const connection = await prisma.marketplaceConnection.upsert({
      where: {
        organizationId_marketplace: {
          organizationId,
          marketplace: params.marketplace,
        },
      },
      create: {
        organizationId,
        marketplace: params.marketplace,
        status: 'not_connected',
        encryptedCredentials: null,
        credentialPreview: null,
      },
      update: {
        status: 'not_connected',
        encryptedCredentials: null,
        credentialPreview: null,
      },
      select: {
        id: true,
        marketplace: true,
        status: true,
        credentialPreview: true,
        updatedAt: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        action: 'credentials_deleted',
        userId,
        organizationId,
        metadata: { marketplace: params.marketplace },
      },
    })

    return { connection }
  })
}
