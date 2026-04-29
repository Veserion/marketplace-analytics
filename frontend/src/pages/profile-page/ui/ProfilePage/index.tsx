import classNames from 'classnames/bind'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { apiRequest } from '@/shared/api/client'
import {
  deleteCsvRecord,
  getCsvRecords,
  type CsvStorageMode,
  type CsvStorageRecord,
} from '@/shared/lib/indexed-db'
import { Typography } from '@/shared/ui-kit/typography'
import { ApiKeysSection } from './components/ApiKeysSection'
import { ProfileSidebar } from './components/ProfileSidebar'
import { SecuritySection } from './components/SecuritySection'
import { UploadedFilesSection } from './components/UploadedFilesSection'
import type {
  Marketplace,
  MarketplaceConnection,
  ProfileSection,
  SecurityFormState,
  SecurityStep,
  StatusMessage,
} from './components/types'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProfilePage'

function upsertConnection(
  connections: MarketplaceConnection[],
  nextConnection: MarketplaceConnection,
): MarketplaceConnection[] {
  const hasConnection = connections.some((connection) => connection.marketplace === nextConnection.marketplace)
  if (!hasConnection) return [...connections, nextConnection]

  return connections.map((connection) => (
    connection.marketplace === nextConnection.marketplace ? nextConnection : connection
  ))
}

const INITIAL_SECURITY_FORM: SecurityFormState = {
  code: '',
  newPassword: '',
  repeatPassword: '',
}

export function ProfilePage() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<ProfileSection>('apiKeys')
  const [records, setRecords] = useState<CsvStorageRecord[]>([])
  const [filesError, setFilesError] = useState('')
  const [isFilesLoading, setIsFilesLoading] = useState(true)
  const [connections, setConnections] = useState<MarketplaceConnection[]>([])
  const [isConnectionsLoading, setIsConnectionsLoading] = useState(false)
  const [savingMarketplace, setSavingMarketplace] = useState<Marketplace | null>(null)
  const [credentialsMessage, setCredentialsMessage] = useState<StatusMessage | null>(null)
  const [ozonCredentials, setOzonCredentials] = useState({ clientId: '', apiKey: '' })
  const [wildberriesToken, setWildberriesToken] = useState('')
  const [securityStep, setSecurityStep] = useState<SecurityStep>('requestCode')
  const [securityForm, setSecurityForm] = useState<SecurityFormState>(INITIAL_SECURITY_FORM)
  const [isSecurityPending, setIsSecurityPending] = useState(false)
  const [securityMessage, setSecurityMessage] = useState<StatusMessage | null>(null)

  const loadRecords = useCallback(async (): Promise<void> => {
    setFilesError('')
    setIsFilesLoading(true)
    try {
      setRecords(await getCsvRecords())
    } catch {
      setFilesError('Не удалось прочитать список локально сохраненных файлов.')
    } finally {
      setIsFilesLoading(false)
    }
  }, [])

  const loadConnections = useCallback(async (): Promise<void> => {
    if (!session) return

    setCredentialsMessage(null)
    setIsConnectionsLoading(true)
    try {
      const response = await apiRequest<{ connections: MarketplaceConnection[] }>('/marketplace-connections', {
        token: session.token,
      })
      setConnections(response.connections)
    } catch (err) {
      setCredentialsMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось загрузить подключения.',
      })
    } finally {
      setIsConnectionsLoading(false)
    }
  }, [session])

  useEffect(() => {
    let isCancelled = false

    getCsvRecords()
      .then((nextRecords) => {
        if (isCancelled) return
        setRecords(nextRecords)
      })
      .catch(() => {
        if (isCancelled) return
        setFilesError('Не удалось прочитать список локально сохраненных файлов.')
      })
      .finally(() => {
        if (isCancelled) return
        setIsFilesLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!session) return undefined

    const timeoutId = window.setTimeout(() => {
      void loadConnections()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadConnections, session])

  const onSectionChange = (section: ProfileSection): void => {
    setActiveSection(section)
    if (section !== 'security') return

    setSecurityStep('requestCode')
    setSecurityForm(INITIAL_SECURITY_FORM)
    setSecurityMessage(null)
  }

  const onDeleteRecord = async (mode: CsvStorageMode): Promise<void> => {
    setFilesError('')
    try {
      await deleteCsvRecord(mode)
      setRecords((currentRecords) => currentRecords.filter((record) => record.mode !== mode))
    } catch {
      setFilesError('Не удалось удалить файл из локального хранилища.')
    }
  }

  const onSaveOzonCredentials = async (): Promise<void> => {
    if (!session) return
    if (!ozonCredentials.clientId.trim() || !ozonCredentials.apiKey.trim()) {
      setCredentialsMessage({ type: 'error', text: 'Введите Client ID и API Key Ozon.' })
      return
    }

    setCredentialsMessage(null)
    setSavingMarketplace('ozon')
    try {
      const response = await apiRequest<{ connection: MarketplaceConnection }>('/marketplace-connections/ozon/credentials', {
        method: 'PUT',
        token: session.token,
        body: JSON.stringify(ozonCredentials),
      })
      setConnections((currentConnections) => upsertConnection(currentConnections, response.connection))
      setOzonCredentials({ clientId: '', apiKey: '' })
      setCredentialsMessage({ type: 'success', text: 'Ключи Ozon сохранены.' })
    } catch (err) {
      setCredentialsMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось сохранить ключи Ozon.',
      })
    } finally {
      setSavingMarketplace(null)
    }
  }

  const onSaveWildberriesCredentials = async (): Promise<void> => {
    if (!session) return
    if (!wildberriesToken.trim()) {
      setCredentialsMessage({ type: 'error', text: 'Введите токен Wildberries.' })
      return
    }

    setCredentialsMessage(null)
    setSavingMarketplace('wildberries')
    try {
      const response = await apiRequest<{ connection: MarketplaceConnection }>('/marketplace-connections/wildberries/credentials', {
        method: 'PUT',
        token: session.token,
        body: JSON.stringify({ token: wildberriesToken }),
      })
      setConnections((currentConnections) => upsertConnection(currentConnections, response.connection))
      setWildberriesToken('')
      setCredentialsMessage({ type: 'success', text: 'Токен Wildberries сохранен.' })
    } catch (err) {
      setCredentialsMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось сохранить токен Wildberries.',
      })
    } finally {
      setSavingMarketplace(null)
    }
  }

  const onDeleteCredentials = async (marketplace: Marketplace): Promise<void> => {
    if (!session) return

    setCredentialsMessage(null)
    setSavingMarketplace(marketplace)
    try {
      const response = await apiRequest<{ connection: MarketplaceConnection }>(`/marketplace-connections/${marketplace}/credentials`, {
        method: 'DELETE',
        token: session.token,
      })
      setConnections((currentConnections) => upsertConnection(currentConnections, response.connection))
      setCredentialsMessage({ type: 'success', text: 'Подключение отключено.' })
    } catch (err) {
      setCredentialsMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось отключить подключение.',
      })
    } finally {
      setSavingMarketplace(null)
    }
  }

  const onRequestPasswordCode = async (): Promise<void> => {
    if (!session) return

    setSecurityMessage(null)
    setIsSecurityPending(true)
    try {
      await apiRequest<{ ok: true }>('/me/password-code/request', {
        method: 'POST',
        token: session.token,
      })
      setSecurityStep('changePassword')
      setSecurityMessage({ type: 'success', text: 'Код отправлен на email аккаунта.' })
    } catch (err) {
      setSecurityMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось отправить код.',
      })
    } finally {
      setIsSecurityPending(false)
    }
  }

  const onConfirmPasswordChange = async (): Promise<void> => {
    if (!session) return
    if (!/^\d{6}$/.test(securityForm.code)) {
      setSecurityMessage({ type: 'error', text: 'Введите 6 цифр из письма.' })
      return
    }
    if (securityForm.newPassword !== securityForm.repeatPassword) {
      setSecurityMessage({ type: 'error', text: 'Новый пароль и повтор не совпадают.' })
      return
    }
    if (securityForm.newPassword.length < 8) {
      setSecurityMessage({ type: 'error', text: 'Новый пароль должен быть не короче 8 символов.' })
      return
    }

    setSecurityMessage(null)
    setIsSecurityPending(true)
    try {
      await apiRequest<{ ok: true }>('/me/password-code/verify', {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({
          code: securityForm.code,
          newPassword: securityForm.newPassword,
        }),
      })
      setSecurityForm(INITIAL_SECURITY_FORM)
      setSecurityStep('requestCode')
      setSecurityMessage({ type: 'success', text: 'Пароль обновлен.' })
    } catch (err) {
      setSecurityMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось сменить пароль.',
      })
    } finally {
      setIsSecurityPending(false)
    }
  }

  const onLogout = (): void => {
    logout()
    navigate('/ozon')
  }

  return (
    <main className={cn(BLOCK_NAME)}>
      <header className={cn(`${BLOCK_NAME}__head`)}>
        <div>
          <Typography variant="caption" color="muted" className={cn(`${BLOCK_NAME}__eyebrow`)}>
            Профиль
          </Typography>
          <Typography as="h1" variant="h1" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
            Настройки аккаунта и данных
          </Typography>
          {session && (
            <Typography variant="body2" color="muted" className={cn(`${BLOCK_NAME}__workspace`)}>
              Рабочее пространство: {session.organization.name}
            </Typography>
          )}
        </div>
      </header>

      <div className={cn(`${BLOCK_NAME}__layout`)}>
        <ProfileSidebar
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          onLogout={onLogout}
        />

        <section className={cn(`${BLOCK_NAME}__content`)}>
          {activeSection === 'apiKeys' && (
            <ApiKeysSection
              connections={connections}
              isConnectionsLoading={isConnectionsLoading}
              savingMarketplace={savingMarketplace}
              credentialsMessage={credentialsMessage}
              ozonCredentials={ozonCredentials}
              wildberriesToken={wildberriesToken}
              onLoadConnections={() => void loadConnections()}
              onOzonCredentialsChange={setOzonCredentials}
              onWildberriesTokenChange={setWildberriesToken}
              onSaveOzonCredentials={() => void onSaveOzonCredentials()}
              onSaveWildberriesCredentials={() => void onSaveWildberriesCredentials()}
              onDeleteCredentials={(marketplace) => void onDeleteCredentials(marketplace)}
            />
          )}

          {activeSection === 'uploadedFiles' && (
            <UploadedFilesSection
              records={records}
              filesError={filesError}
              isFilesLoading={isFilesLoading}
              onLoadRecords={() => void loadRecords()}
              onDeleteRecord={(mode) => void onDeleteRecord(mode)}
            />
          )}

          {activeSection === 'security' && (
            <SecuritySection
              email={session?.user.email}
              securityStep={securityStep}
              securityForm={securityForm}
              securityMessage={securityMessage}
              isSecurityPending={isSecurityPending}
              onSecurityFormChange={setSecurityForm}
              onRequestPasswordCode={() => void onRequestPasswordCode()}
              onConfirmPasswordChange={() => void onConfirmPasswordChange()}
            />
          )}
        </section>
      </div>
    </main>
  )
}
