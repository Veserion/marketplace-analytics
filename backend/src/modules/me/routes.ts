import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  generateEmailCode,
  getEmailCodeExpiresAt,
  hashEmailCode,
  verifyEmailCodeHash,
} from '../../lib/email-code.js'
import { requireAuth } from '../../lib/auth-hook.js'
import { sendEmailCode } from '../../lib/mailer.js'
import { hashPassword } from '../../lib/password.js'
import { prisma } from '../../lib/prisma.js'
import type { AuthenticatedRequest } from '../../types.js'

const MAX_EMAIL_CODE_ATTEMPTS = 5

const verifyPasswordCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8),
})

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

  app.post('/me/password-code/request', { preHandler: requireAuth }, async (request) => {
    const { userId, organizationId } = (request as AuthenticatedRequest).auth
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    })
    const code = generateEmailCode()

    await prisma.emailAuthCode.create({
      data: {
        email: user.email,
        codeHash: hashEmailCode(user.email, code),
        expiresAt: getEmailCodeExpiresAt(),
      },
    })
    await prisma.auditLog.create({
      data: {
        action: 'email_code_requested',
        userId,
        organizationId,
        metadata: { purpose: 'password_change' },
      },
    })
    await sendEmailCode({ email: user.email, code })

    return { ok: true }
  })

  app.post('/me/password-code/verify', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).auth
    const body = verifyPasswordCodeSchema.parse(request.body)
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    })
    const authCode = await prisma.emailAuthCode.findFirst({
      where: {
        email: user.email,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!authCode || authCode.attempts >= MAX_EMAIL_CODE_ATTEMPTS) {
      return reply.code(401).send({ error: 'Код неверный или истек.' })
    }

    if (!verifyEmailCodeHash(user.email, body.code, authCode.codeHash)) {
      await prisma.emailAuthCode.update({
        where: { id: authCode.id },
        data: { attempts: { increment: 1 } },
      })
      return reply.code(401).send({ error: 'Код неверный или истек.' })
    }

    await prisma.$transaction(async (tx) => {
      await tx.emailAuthCode.update({
        where: { id: authCode.id },
        data: { consumedAt: new Date() },
      })
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(body.newPassword) },
      })
    })

    return { ok: true }
  })
}
