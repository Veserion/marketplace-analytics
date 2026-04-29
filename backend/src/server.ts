import { env } from './env.js'
import { closePrisma } from './lib/prisma.js'
import { buildApp } from './app.js'

const app = await buildApp()

const shutdown = async (): Promise<void> => {
  app.log.info('Shutting down server')
  await app.close()
  await closePrisma()
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0))
})

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0))
})

await app.listen({
  host: env.HOST,
  port: env.PORT,
})
