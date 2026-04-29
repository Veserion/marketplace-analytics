import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'

const CODE_MIN = 100000
const CODE_MAX = 999999

export function generateEmailCode(): string {
  return String(randomInt(CODE_MIN, CODE_MAX + 1))
}

export function hashEmailCode(email: string, code: string): string {
  return createHash('sha256')
    .update(`${email}:${code}:${env.JWT_SECRET}`)
    .digest('hex')
}

export function verifyEmailCodeHash(email: string, code: string, codeHash: string): boolean {
  const expectedHash = hashEmailCode(email, code)
  const expected = Buffer.from(expectedHash, 'hex')
  const actual = Buffer.from(codeHash, 'hex')
  if (expected.length !== actual.length) return false

  return timingSafeEqual(expected, actual)
}

export function getEmailCodeExpiresAt(): Date {
  return new Date(Date.now() + env.EMAIL_CODE_TTL_MINUTES * 60 * 1000)
}
