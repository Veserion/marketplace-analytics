import classNames from 'classnames/bind'
import { SafetyOutlined } from '@ant-design/icons'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import Input from 'antd/es/input'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from '../index.module.scss'
import type { SecurityFormState, SecurityStep, StatusMessage } from './types'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProfilePage'

type SecuritySectionProps = {
  email: string | undefined
  securityStep: SecurityStep
  securityForm: SecurityFormState
  securityMessage: StatusMessage | null
  isSecurityPending: boolean
  onSecurityFormChange: (form: SecurityFormState) => void
  onRequestPasswordCode: () => void
  onConfirmPasswordChange: () => void
}

export function SecuritySection({
  email,
  securityStep,
  securityForm,
  securityMessage,
  isSecurityPending,
  onSecurityFormChange,
  onRequestPasswordCode,
  onConfirmPasswordChange,
}: SecuritySectionProps) {
  return (
    <UiPanel title="Безопасность">
      <div className={cn(`${BLOCK_NAME}__api-note`)}>
        <SafetyOutlined className={cn(`${BLOCK_NAME}__api-note-icon`)} />
        <div>
          <Typography variant="body2" color="accent" semiBold>
            Перед сменой пароля нужно ввести OTP-код
          </Typography>
          <Typography variant="body3" color="muted">
            Код придет на {email}. После подтверждения можно задать новый пароль.
          </Typography>
        </div>
      </div>
      <div className={cn(`${BLOCK_NAME}__security-content`)}>
        {securityMessage && (
          <Alert
            type={securityMessage.type}
            showIcon
            message={securityMessage.text}
          />
        )}
        {securityStep === 'requestCode' ? (
          <Button
            type="primary"
            onClick={onRequestPasswordCode}
            loading={isSecurityPending}
            className={cn(`${BLOCK_NAME}__security-primary-button`)}
          >
            Получить OTP-код
          </Button>
        ) : (
          <>
            <div className={cn(`${BLOCK_NAME}__security-fields`)}>
              <label className={cn(`${BLOCK_NAME}__field`)}>
                <span>OTP-код из письма</span>
                <Input
                  value={securityForm.code}
                  onChange={(event) => onSecurityFormChange({
                    ...securityForm,
                    code: event.target.value,
                  })}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                />
              </label>
              <label className={cn(`${BLOCK_NAME}__field`)}>
                <span>Новый пароль</span>
                <Input.Password
                  value={securityForm.newPassword}
                  onChange={(event) => onSecurityFormChange({
                    ...securityForm,
                    newPassword: event.target.value,
                  })}
                  autoComplete="new-password"
                  placeholder="Минимум 8 символов"
                />
              </label>
              <label className={cn(`${BLOCK_NAME}__field`)}>
                <span>Повторите пароль</span>
                <Input.Password
                  value={securityForm.repeatPassword}
                  onChange={(event) => onSecurityFormChange({
                    ...securityForm,
                    repeatPassword: event.target.value,
                  })}
                  autoComplete="new-password"
                  placeholder="Повторите новый пароль"
                />
              </label>
            </div>
            <div className={cn(`${BLOCK_NAME}__security-actions`)}>
              <Button onClick={onRequestPasswordCode} loading={isSecurityPending}>
                Отправить код еще раз
              </Button>
              <Button
                type="primary"
                onClick={onConfirmPasswordChange}
                loading={isSecurityPending}
              >
                Сменить пароль
              </Button>
            </div>
          </>
        )}
      </div>
    </UiPanel>
  )
}
