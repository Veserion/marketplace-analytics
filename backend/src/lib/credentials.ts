import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_VERSION = 1

function getEncryptionKey(): Buffer {
  const base64Key = Buffer.from(env.ENCRYPTION_KEY, 'base64')
  if (base64Key.length === 32) return base64Key

  return createHash('sha256').update(env.ENCRYPTION_KEY).digest()
}

export type EncryptedPayload = {
  version: number
  iv: string
  authTag: string
  ciphertext: string
}

export function encryptCredentials(value: unknown): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  const plaintext = JSON.stringify(value)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  const payload: EncryptedPayload = {
    version: KEY_VERSION,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }

  return JSON.stringify(payload)
}

export function decryptCredentials<T>(value: string): T {
  const payload = JSON.parse(value) as EncryptedPayload
  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(payload.iv, 'base64'),
    { authTagLength: AUTH_TAG_LENGTH },
  )
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')

  return JSON.parse(plaintext) as T
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export function getCredentialKeyVersion(): number {
  return KEY_VERSION
}
