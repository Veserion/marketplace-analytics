import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { env } from './env.js'
import { authRoutes } from './modules/auth/routes.js'
import { connectionRoutes } from './modules/connections/routes.js'
import { meRoutes } from './modules/me/routes.js'

export async function buildApp() {
  const app = Fastify({
    logger: true,
  })

  await app.register(helmet)
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.warn({ error }, 'Validation failed')
      return reply.code(400).send({
        error: 'Validation failed.',
        details: error.issues,
      })
    }

    request.log.error({ error }, 'Request failed')
    return reply.code(500).send({ error: 'Internal server error.' })
  })

  app.get('/health', async () => ({ ok: true }))

  await app.register(authRoutes, { prefix: '/api' })
  await app.register(meRoutes, { prefix: '/api' })
  await app.register(connectionRoutes, { prefix: '/api' })

  return app
}
