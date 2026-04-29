import type { FastifyRequest } from 'fastify'

export type AuthContext = {
  userId: string
  organizationId: string
}

export type AuthenticatedRequest = FastifyRequest & {
  auth: AuthContext
}
