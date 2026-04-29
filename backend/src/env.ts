import 'dotenv/config'
import { z } from 'zod'

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== 'string') return value

  const normalizedValue = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalizedValue)) return true
  if (['false', '0', 'no', 'off'].includes(normalizedValue)) return false

  return value
}, z.boolean())

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be a 32-byte base64 key. Generate it with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromEnv.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Marketplace Analytics <noreply@localhost>'),
})

export const env = envSchema.parse(process.env)
