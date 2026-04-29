import classNames from 'classnames/bind'
import {
  ApiOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  SafetyOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import Input from 'antd/es/input'
import Popconfirm from 'antd/es/popconfirm'
import Tag from 'antd/es/tag'
import { UiCard } from '@/shared/ui-kit/card'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from '../index.module.scss'
import type { Marketplace, MarketplaceConnection, StatusMessage } from './types'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProfilePage'

type ApiKeysSectionProps = {
  connections: MarketplaceConnection[]
  isConnectionsLoading: boolean
  savingMarketplace: Marketplace | null
  credentialsMessage: StatusMessage | null
  ozonCredentials: { clientId: string, apiKey: string }
  wildberriesToken: string
  onLoadConnections: () => void
  onOzonCredentialsChange: (credentials: { clientId: string, apiKey: string }) => void
  onWildberriesTokenChange: (token: string) => void
  onSaveOzonCredentials: () => void
  onSaveWildberriesCredentials: () => void
  onDeleteCredentials: (marketplace: Marketplace) => void
}

export function ApiKeysSection({
  connections,
  isConnectionsLoading,
  savingMarketplace,
  credentialsMessage,
  ozonCredentials,
  wildberriesToken,
  onLoadConnections,
  onOzonCredentialsChange,
  onWildberriesTokenChange,
  onSaveOzonCredentials,
  onSaveWildberriesCredentials,
  onDeleteCredentials,
}: ApiKeysSectionProps) {
  const ozonConnection = connections.find((connection) => connection.marketplace === 'ozon')
  const wildberriesConnection = connections.find((connection) => connection.marketplace === 'wildberries')

  return (
    <UiPanel
      title="API-ключи"
      headActions={(
        <Button icon={<ReloadOutlined />} onClick={onLoadConnections} loading={isConnectionsLoading}>
          Обновить
        </Button>
      )}
    >
      <div className={cn(`${BLOCK_NAME}__api-note`)}>
        <SafetyOutlined className={cn(`${BLOCK_NAME}__api-note-icon`)} />
        <div>
          <Typography variant="body2" color="accent" semiBold>
            Ключи сохраняются на backend в зашифрованном виде
          </Typography>
          <Typography variant="body3" color="muted">
            После сохранения в интерфейсе показывается только маска ключа. Полное значение обратно не выводится.
          </Typography>
        </div>
      </div>
      {credentialsMessage && (
        <Alert
          type={credentialsMessage.type}
          showIcon
          message={credentialsMessage.text}
          className={cn(`${BLOCK_NAME}__compact-alert`)}
        />
      )}
      <div className={cn(`${BLOCK_NAME}__cards-grid`)}>
        <UiCard className={cn(`${BLOCK_NAME}__integration-card`)}>
          <div className={cn(`${BLOCK_NAME}__card-head`)}>
            <ApiOutlined className={cn(`${BLOCK_NAME}__card-icon`)} />
            <div>
              <Typography variant="h3" color="accent" className={cn(`${BLOCK_NAME}__card-title`)}>
                Ozon Seller API
              </Typography>
              <Typography variant="body3" color="muted">
                Client ID и API Key
              </Typography>
            </div>
          </div>
          <div className={cn(`${BLOCK_NAME}__connection-meta`)}>
            <Tag color={ozonConnection?.status === 'connected' ? 'green' : 'default'}>
              {ozonConnection?.status === 'connected' ? 'Подключено' : 'Не подключено'}
            </Tag>
            {ozonConnection?.credentialPreview && (
              <Typography variant="body3" color="muted">
                {ozonConnection.credentialPreview}
              </Typography>
            )}
          </div>
          <label className={cn(`${BLOCK_NAME}__field`)}>
            <span>Client ID</span>
            <Input
              value={ozonCredentials.clientId}
              onChange={(event) => onOzonCredentialsChange({
                ...ozonCredentials,
                clientId: event.target.value,
              })}
              placeholder="Введите Client ID"
            />
          </label>
          <label className={cn(`${BLOCK_NAME}__field`)}>
            <span>API Key</span>
            <Input.Password
              value={ozonCredentials.apiKey}
              onChange={(event) => onOzonCredentialsChange({
                ...ozonCredentials,
                apiKey: event.target.value,
              })}
              placeholder="Введите API Key"
            />
          </label>
          <div className={cn(`${BLOCK_NAME}__card-actions`)}>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={onSaveOzonCredentials}
              loading={savingMarketplace === 'ozon'}
            >
              Сохранить
            </Button>
            {ozonConnection?.status === 'connected' && (
              <Popconfirm
                title="Отключить Ozon?"
                description="Сохраненные ключи будут удалены."
                okText="Отключить"
                cancelText="Отмена"
                onConfirm={() => onDeleteCredentials('ozon')}
              >
                <Button danger loading={savingMarketplace === 'ozon'}>
                  Отключить
                </Button>
              </Popconfirm>
            )}
          </div>
        </UiCard>

        <UiCard className={cn(`${BLOCK_NAME}__integration-card`)}>
          <div className={cn(`${BLOCK_NAME}__card-head`)}>
            <CloudUploadOutlined className={cn(`${BLOCK_NAME}__card-icon`)} />
            <div>
              <Typography variant="h3" color="accent" className={cn(`${BLOCK_NAME}__card-title`)}>
                Wildberries API
              </Typography>
              <Typography variant="body3" color="muted">
                Токен кабинета продавца
              </Typography>
            </div>
          </div>
          <div className={cn(`${BLOCK_NAME}__connection-meta`)}>
            <Tag color={wildberriesConnection?.status === 'connected' ? 'green' : 'default'}>
              {wildberriesConnection?.status === 'connected' ? 'Подключено' : 'Не подключено'}
            </Tag>
            {wildberriesConnection?.credentialPreview && (
              <Typography variant="body3" color="muted">
                {wildberriesConnection.credentialPreview}
              </Typography>
            )}
          </div>
          <label className={cn(`${BLOCK_NAME}__field`)}>
            <span>Token</span>
            <Input.Password
              value={wildberriesToken}
              onChange={(event) => onWildberriesTokenChange(event.target.value)}
              placeholder="Введите токен Wildberries"
            />
          </label>
          <div className={cn(`${BLOCK_NAME}__card-actions`)}>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={onSaveWildberriesCredentials}
              loading={savingMarketplace === 'wildberries'}
            >
              Сохранить
            </Button>
            {wildberriesConnection?.status === 'connected' && (
              <Popconfirm
                title="Отключить Wildberries?"
                description="Сохраненный токен будет удален."
                okText="Отключить"
                cancelText="Отмена"
                onConfirm={() => onDeleteCredentials('wildberries')}
              >
                <Button danger loading={savingMarketplace === 'wildberries'}>
                  Отключить
                </Button>
              </Popconfirm>
            )}
          </div>
        </UiCard>
      </div>
    </UiPanel>
  )
}
