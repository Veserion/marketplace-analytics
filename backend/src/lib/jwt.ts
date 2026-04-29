import { SignJWT, jwtVerify } from 'jose'
import { env } from '../env.js'

const JWT_ISSUER = 'marketplace-analytics'
const JWT_AUDIENCE = 'marketplace-analytics-api'
const TOKEN_TTL = '7d'
const secret = new TextEncoder().encode(env.JWT_SECRET)

export type AuthTokenPayload = {
  userId: string
  organizationId: string
}

export async function signAuthToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(TOKEN_TTL)
    .sign(secret)
}

export async function verifyAuthToken(token: string): Promise<AuthTokenPayload> {
  const result = await jwtVerify(token, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })

  const userId = result.payload.userId
  const organizationId = result.payload.organizationId
  if (typeof userId !== 'string' || typeof organizationId !== 'string') {
    throw new Error('Invalid token payload.')
  }

  return { userId, organizationId }
}
