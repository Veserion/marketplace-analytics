import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  generateEmailCode,
  getEmailCodeExpiresAt,
  hashEmailCode,
  verifyEmailCodeHash,
} from '../../lib/email-code.js'
import { signAuthToken } from '../../lib/jwt.js'
import { sendEmailCode } from '../../lib/mailer.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { prisma } from '../../lib/prisma.js'
import { isRateLimited } from '../../lib/rate-limit.js'

const MAX_EMAIL_CODE_ATTEMPTS = 5
const EMAIL_CODE_REQUEST_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 }
const LOGIN_REQUEST_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 }

const registerSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120).optional(),
  organizationName: z.string().trim().min(1).max(120).optional(),
})

const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
})

const requestEmailCodeSchema = z.object({
  email: z.email().toLowerCase(),
})

const verifyEmailCodeSchema = z.object({
  email: z.email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  organizationName: z.string().trim().min(1).max(120).optional(),
})

function toAuthResponse(input: {
  token: string
  user: { id: string, email: string, name: string | null }
  organization: { id: string, name: string }
}) {
  return {
    token: input.token,
    user: input.user,
    organization: input.organization,
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/email-code/request', async (request, reply) => {
    const body = requestEmailCodeSchema.parse(request.body)
    if (isRateLimited(`email-code:${request.ip}:${body.email}`, EMAIL_CODE_REQUEST_LIMIT)) {
      return reply.code(429).send({ error: 'Too many email code requests. Please try again later.' })
    }

    const code = generateEmailCode()

    await prisma.emailAuthCode.create({
      data: {
        email: body.email,
        codeHash: hashEmailCode(body.email, code),
        expiresAt: getEmailCodeExpiresAt(),
      },
    })
    await prisma.auditLog.create({
      data: {
        action: 'email_code_requested',
        metadata: { email: body.email },
      },
    })
    await sendEmailCode({ email: body.email, code })

    return { ok: true }
  })

  app.post('/auth/email-code/verify', async (request, reply) => {
    const body = verifyEmailCodeSchema.parse(request.body)
    const authCode = await prisma.emailAuthCode.findFirst({
      where: {
        email: body.email,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!authCode || authCode.attempts >= MAX_EMAIL_CODE_ATTEMPTS) {
      return reply.code(401).send({ error: 'Invalid or expired email code.' })
    }

    if (!verifyEmailCodeHash(body.email, body.code, authCode.codeHash)) {
      await prisma.emailAuthCode.update({
        where: { id: authCode.id },
        data: { attempts: { increment: 1 } },
      })
      return reply.code(401).send({ error: 'Invalid or expired email code.' })
    }

    if (body.password) {
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
        select: { passwordHash: true },
      })

      if (existingUser?.passwordHash) {
        return reply.code(409).send({ error: 'User with this email already exists.' })
      }
    }

    const organizationName = body.organizationName ?? body.name ?? body.email
    const passwordHash = body.password ? await hashPassword(body.password) : null
    const result = await prisma.$transaction(async (tx) => {
      await tx.emailAuthCode.update({
        where: { id: authCode.id },
        data: { consumedAt: new Date() },
      })

      const existingUser = await tx.user.findUnique({
        where: { email: body.email },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          memberships: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: {
              organization: {
                select: { id: true, name: true },
              },
            },
          },
        },
      })

      if (existingUser) {
        const organization = existingUser.memberships[0]?.organization
        if (!organization) {
          throw new Error('User has no organization.')
        }

        if ((body.name && !existingUser.name) || (passwordHash && !existingUser.passwordHash)) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: body.name && !existingUser.name ? body.name : undefined,
              passwordHash: passwordHash && !existingUser.passwordHash ? passwordHash : undefined,
            },
          })
        }

        await tx.auditLog.create({
          data: {
            action: 'email_code_verified',
            userId: existingUser.id,
            organizationId: organization.id,
          },
        })
        await tx.auditLog.create({
          data: {
            action: 'user_logged_in',
            userId: existingUser.id,
            organizationId: organization.id,
          },
        })

        return {
          user: { id: existingUser.id, email: existingUser.email, name: body.name ?? existingUser.name },
          organization,
          isNewUser: false,
        }
      }

      const user = await tx.user.create({
        data: {
          email: body.email,
          passwordHash,
          name: body.name,
        },
        select: { id: true, email: true, name: true },
      })
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          members: {
            create: {
              userId: user.id,
              role: 'owner',
            },
          },
        },
        select: { id: true, name: true },
      })

      await tx.auditLog.create({
        data: {
          action: 'email_code_verified',
          userId: user.id,
          organizationId: organization.id,
        },
      })
      await tx.auditLog.create({
        data: {
          action: 'user_registered',
          userId: user.id,
          organizationId: organization.id,
        },
      })

      return { user, organization, isNewUser: true }
    })

    const token = await signAuthToken({
      userId: result.user.id,
      organizationId: result.organization.id,
    })

    return reply.code(result.isNewUser ? 201 : 200).send(toAuthResponse({ token, ...result }))
  })

  app.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    })

    if (existingUser) {
      return reply.code(409).send({ error: 'User with this email already exists.' })
    }

    const passwordHash = await hashPassword(body.password)
    const organizationName = body.organizationName ?? body.name ?? body.email
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          passwordHash,
          name: body.name,
        },
        select: { id: true, email: true, name: true },
      })
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          members: {
            create: {
              userId: user.id,
              role: 'owner',
            },
          },
        },
        select: { id: true, name: true },
      })

      await tx.auditLog.create({
        data: {
          action: 'user_registered',
          userId: user.id,
          organizationId: organization.id,
        },
      })

      return { user, organization }
    })

    const token = await signAuthToken({
      userId: result.user.id,
      organizationId: result.organization.id,
    })

    return reply.code(201).send(toAuthResponse({ token, ...result }))
  })

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    if (isRateLimited(`login:${request.ip}:${body.email}`, LOGIN_REQUEST_LIMIT)) {
      return reply.code(429).send({ error: 'Too many login attempts. Please try again later.' })
    }

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        memberships: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            organization: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })

    if (!user?.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid email or password.' })
    }

    const organization = user.memberships[0]?.organization
    if (!organization) {
      return reply.code(403).send({ error: 'User has no organization.' })
    }

    await prisma.auditLog.create({
      data: {
        action: 'user_logged_in',
        userId: user.id,
        organizationId: organization.id,
      },
    })

    const token = await signAuthToken({
      userId: user.id,
      organizationId: organization.id,
    })

    return toAuthResponse({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      organization,
    })
  })
}
