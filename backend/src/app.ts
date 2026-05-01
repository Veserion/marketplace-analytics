import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { Prisma } from '@prisma/client/index'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { env } from './env.js'
import { MailDeliveryError } from './lib/mailer.js'
import { authRoutes } from './modules/auth/routes.js'
import { connectionRoutes } from './modules/connections/routes.js'
import { meRoutes } from './modules/me/routes.js'

export async function buildApp() {
  const app = Fastify({
    logger: true,
  })

  await app.register(helmet, {
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  })
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.warn({ error }, 'Validation failed')
      return reply.code(400).send({
        error: 'Validation failed.',
        details: error.issues,
      })
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P1000', 'P1001', 'P1003', 'P1010'].includes(error.code)) {
      request.log.error({ error }, 'Database connection failed')
      return reply.code(503).send({
        error: 'Database connection failed. Check DATABASE_URL and make sure PostgreSQL is initialized.',
      })
    }

    if (error instanceof MailDeliveryError) {
      request.log.error({ error }, 'Email delivery failed')
      return reply.code(502).send({ error: error.message })
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
