import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import classNames from 'classnames/bind'
import { Typography, UiPanel } from '@/shared/ui-kit'
import styles from './ProfilePage.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProfilePage'
const INTEGRATIONS_STORAGE_KEY = 'marketplace-integrations'

type IntegrationKeys = {
  ozonClientId: string
  ozonApiKey: string
  wbApiKey: string
}

const DEFAULT_KEYS: IntegrationKeys = {
  ozonClientId: '',
  ozonApiKey: '',
  wbApiKey: '',
}

export function ProfilePage() {
  const [keys, setKeys] = useState<IntegrationKeys>(DEFAULT_KEYS)
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    const rawKeys = localStorage.getItem(INTEGRATIONS_STORAGE_KEY)

    if (!rawKeys) {
      return
    }

    try {
      const parsedKeys = JSON.parse(rawKeys) as Partial<IntegrationKeys>
      setKeys({
        ozonClientId: parsedKeys.ozonClientId ?? '',
        ozonApiKey: parsedKeys.ozonApiKey ?? '',
        wbApiKey: parsedKeys.wbApiKey ?? '',
      })
    } catch {
      localStorage.removeItem(INTEGRATIONS_STORAGE_KEY)
    }
  }, [])

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    localStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(keys))
    setStatusMessage('Данные сохранены. Можно подключать прямые интеграции.')
  }

  return (
    <main className={cn(BLOCK_NAME)}>
      <header className={cn(`${BLOCK_NAME}__hero`)}>
        <Typography variant="caption" color="light" className={cn(`${BLOCK_NAME}__eyebrow`)}>
          Marketplace Analytics
        </Typography>
        <Typography variant="h1" color="light">Личный кабинет</Typography>
        <Typography variant="body1" color="light" className={cn(`${BLOCK_NAME}__subtitle`)}>
          Здесь хранятся API-ключи для дальнейших прямых интеграций с маркетплейсами.
        </Typography>
      </header>

      <UiPanel title="Ключи интеграций">
        <form className={cn(`${BLOCK_NAME}__form`)} onSubmit={onSubmit}>
          <label className={cn(`${BLOCK_NAME}__field`)}>
            <span>Ozon Client ID</span>
            <input
              type="text"
              value={keys.ozonClientId}
              onChange={(event) => setKeys((prev) => ({ ...prev, ozonClientId: event.target.value }))}
              placeholder="Введите Client ID"
              autoComplete="off"
            />
          </label>

          <label className={cn(`${BLOCK_NAME}__field`)}>
            <span>Ozon API Key</span>
            <input
              type="password"
              value={keys.ozonApiKey}
              onChange={(event) => setKeys((prev) => ({ ...prev, ozonApiKey: event.target.value }))}
              placeholder="Введите API Key"
              autoComplete="off"
            />
          </label>

          <label className={cn(`${BLOCK_NAME}__field`)}>
            <span>Wildberries API Key</span>
            <input
              type="password"
              value={keys.wbApiKey}
              onChange={(event) => setKeys((prev) => ({ ...prev, wbApiKey: event.target.value }))}
              placeholder="Введите API Key"
              autoComplete="off"
            />
          </label>

          <button type="submit" className={cn(`${BLOCK_NAME}__submit`)}>
            Сохранить
          </button>

          {statusMessage && (
            <Typography variant="body2" color="positive">
              {statusMessage}
            </Typography>
          )}
        </form>
      </UiPanel>
    </main>
  )
}
