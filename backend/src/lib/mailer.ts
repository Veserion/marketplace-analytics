import nodemailer from 'nodemailer'
import { env } from '../env.js'

type SendEmailCodeInput = {
  email: string
  code: string
}

export class MailDeliveryError extends Error {
  constructor(message = 'Не удалось отправить email. Проверьте SMTP-настройки отправителя.') {
    super(message)
    this.name = 'MailDeliveryError'
  }
}

function hasSmtpConfig(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD)
}

export async function sendEmailCode({ email, code }: SendEmailCodeInput): Promise<void> {
  if (!hasSmtpConfig()) {
    console.info(`[email-code] ${email}: ${code}`)
    return
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  })

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: 'Код входа в Маркетплейс Метрику',
      text: `Ваш код входа: ${code}. Код действует ${env.EMAIL_CODE_TTL_MINUTES} минут.`,
    })
  } catch (error) {
    throw new MailDeliveryError(
      'Не удалось отправить код. Проверьте, что SMTP_FROM является подтвержденным отправителем в UniSender Go.',
    )
  }
}
