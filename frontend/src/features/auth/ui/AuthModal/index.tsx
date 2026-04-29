import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import Form from 'antd/es/form'
import Input from 'antd/es/input'
import Modal from 'antd/es/modal'
import { useState } from 'react'
import { useAuth } from '@/features/auth/model/useAuth'
import styles from './index.module.scss'

type AuthModalProps = {
  open: boolean
  onClose: () => void
}

type AuthFormValues = {
  email: string
  password: string
  workspaceName: string
  code: string
}

type AuthMode = 'login' | 'register' | 'verify'

type RegistrationDraft = {
  email: string
  password: string
  workspaceName: string
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const [form] = Form.useForm<AuthFormValues>()
  const { login, requestRegistrationCode, verifyRegistrationCode } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft | null>(null)
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState<AuthMode | null>(null)

  const resetAndClose = (): void => {
    form.resetFields()
    setError('')
    setMode('login')
    setRegistrationDraft(null)
    onClose()
  }

  const switchMode = (nextMode: Extract<AuthMode, 'login' | 'register'>): void => {
    form.resetFields()
    setError('')
    setMode(nextMode)
    setRegistrationDraft(null)
  }

  const submitLogin = async (): Promise<void> => {
    setError('')
    setPendingAction('login')

    try {
      const values = await form.validateFields(['email', 'password'])
      await login({ email: values.email, password: values.password })
      resetAndClose()
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setPendingAction(null)
    }
  }

  const submitRegistration = async (): Promise<void> => {
    setError('')
    setPendingAction('register')

    try {
      const values = await form.validateFields(['email', 'password', 'workspaceName'])
      const draft = {
        email: values.email,
        password: values.password,
        workspaceName: values.workspaceName,
      }
      await requestRegistrationCode(draft)
      setRegistrationDraft(draft)
      form.setFieldsValue({ code: '' })
      setMode('verify')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setPendingAction(null)
    }
  }

  const submitCode = async (): Promise<void> => {
    if (!registrationDraft) {
      setError('Сначала заполните форму регистрации.')
      setMode('register')
      return
    }

    setError('')
    setPendingAction('verify')

    try {
      const values = await form.validateFields(['code'])
      await verifyRegistrationCode({
        ...registrationDraft,
        code: values.code,
      })
      resetAndClose()
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setPendingAction(null)
    }
  }

  const title = mode === 'login'
    ? 'Вход в аккаунт'
    : mode === 'register'
      ? 'Регистрация'
      : 'Код подтверждения'
  const subtitle = mode === 'verify'
    ? `Мы отправили код на ${registrationDraft?.email ?? 'указанную почту'}. Введите его, чтобы завершить регистрацию.`
    : mode === 'register'
      ? 'Создайте аккаунт, чтобы сохранять API-ключи и настройки профиля.'
      : 'Войдите, чтобы открыть профиль, API-ключи и настройки данных.'

  return (
    <Modal
      open={open}
      onCancel={resetAndClose}
      footer={null}
      centered
      width={430}
      className={styles.AuthModal}
      destroyOnHidden
    >
      <div className={styles.AuthModal__head}>
        <h2 className={styles.AuthModal__title}>{title}</h2>
        <p className={styles.AuthModal__subtitle}>{subtitle}</p>
      </div>
      <Form form={form} layout="vertical" requiredMark={false} className={styles.AuthModal__form}>
        {error && (
          <Alert
            type="error"
            title={error}
            showIcon
            className={styles.AuthModal__alert}
          />
        )}
        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: 'Введите email' },
            { type: 'email', message: 'Введите корректный email' },
          ]}
          hidden={mode === 'verify'}
        >
          <Input autoComplete="email" placeholder="name@example.com" />
        </Form.Item>
        <Form.Item
          label="Пароль"
          name="password"
          rules={[
            { required: true, message: 'Введите пароль' },
            { min: 8, message: 'Минимум 8 символов' },
          ]}
          hidden={mode === 'verify'}
        >
          <Input.Password
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder="Минимум 8 символов"
          />
        </Form.Item>
        {mode === 'register' && (
          <Form.Item
            label="Рабочее пространство"
            name="workspaceName"
            rules={[
              { required: true, message: 'Введите название рабочего пространства' },
              { max: 120, message: 'Максимум 120 символов' },
            ]}
          >
            <Input autoComplete="organization" placeholder="Например, название магазина" />
          </Form.Item>
        )}
        {mode === 'verify' && (
          <Form.Item
            label="Код из письма"
            name="code"
            rules={[
              { required: true, message: 'Введите код' },
              { pattern: /^\d{6}$/, message: 'Код состоит из 6 цифр' },
            ]}
          >
            <Input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
            />
          </Form.Item>
        )}
        <div className={styles.AuthModal__actions}>
          {mode === 'login' && (
            <>
              <Button
                className={styles.AuthModal__secondaryButton}
                onClick={() => switchMode('register')}
                block
              >
                Регистрация
              </Button>
              <Button
                type="primary"
                onClick={() => void submitLogin()}
                loading={pendingAction === 'login'}
                block
              >
                Войти
              </Button>
            </>
          )}
          {mode === 'register' && (
            <>
              <Button
                className={styles.AuthModal__secondaryButton}
                onClick={() => switchMode('login')}
                block
              >
                Уже есть аккаунт
              </Button>
              <Button
                type="primary"
                onClick={() => void submitRegistration()}
                loading={pendingAction === 'register'}
                block
              >
                Получить код
              </Button>
            </>
          )}
          {mode === 'verify' && (
            <>
              <Button
                className={styles.AuthModal__secondaryButton}
                onClick={() => switchMode('register')}
                block
              >
                Назад
              </Button>
              <Button
                type="primary"
                onClick={() => void submitCode()}
                loading={pendingAction === 'verify'}
                block
              >
                Подтвердить
              </Button>
            </>
          )}
        </div>
      </Form>
    </Modal>
  )
}
