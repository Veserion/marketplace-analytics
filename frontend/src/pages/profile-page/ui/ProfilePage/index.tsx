import classNames from 'classnames/bind'
import {
  ApiOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  LockOutlined,
  ReloadOutlined,
  SafetyOutlined,
} from '@ant-design/icons'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import Input from 'antd/es/input'
import Popconfirm from 'antd/es/popconfirm'
import Tag from 'antd/es/tag'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearCsvRecords,
  deleteCsvRecord,
  getCsvRecords,
  type CsvStorageMode,
  type CsvStorageRecord,
} from '@/shared/lib/indexed-db'
import { UiCard } from '@/shared/ui-kit/card'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProfilePage'

type ProfileSection = 'apiKeys' | 'uploadedFiles' | 'dataSecurity'

type SectionItem = {
  key: ProfileSection
  title: string
  description: string
}

type CsvRecordMeta = {
  title: string
  marketplace: string
  kind: string
}

const PROFILE_SECTIONS: SectionItem[] = [
  {
    key: 'apiKeys',
    title: 'API-ключи',
    description: 'Подключения маркетплейсов',
  },
  {
    key: 'uploadedFiles',
    title: 'Загруженные файлы',
    description: 'Отчеты и себестоимость',
  },
  {
    key: 'dataSecurity',
    title: 'Данные и безопасность',
    description: 'Локальное хранение',
  },
]

const CSV_RECORD_META: Record<CsvStorageMode, CsvRecordMeta> = {
  unitEconomics: {
    title: 'Ozon: юнит-экономика',
    marketplace: 'Ozon',
    kind: 'Основной отчет',
  },
  accrualReport: {
    title: 'Ozon: отчет по поступлениям',
    marketplace: 'Ozon',
    kind: 'Основной отчет',
  },
  ozonCogs: {
    title: 'Ozon: себестоимость',
    marketplace: 'Ozon',
    kind: 'Справочник',
  },
  wildberriesAccrualReport: {
    title: 'Wildberries: еженедельный отчет',
    marketplace: 'Wildberries',
    kind: 'Основной отчет',
  },
  wildberriesForeignAccrualReport: {
    title: 'Wildberries: отчет по другим странам',
    marketplace: 'Wildberries',
    kind: 'Дополнительный отчет',
  },
  wildberriesCogs: {
    title: 'Wildberries: себестоимость',
    marketplace: 'Wildberries',
    kind: 'Справочник',
  },
}

const LOCAL_STORAGE_KEYS = [
  'unit_economics_vat_rate_percent',
  'unit_economics_tax_rate_percent',
  'wildberries_accrual_vat_rate_percent',
  'wildberries_accrual_tax_rate_percent',
  'wildberries_cogs_matching_mode',
]

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatSize(value: string): string {
  const bytes = new Blob([value]).size
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export function ProfilePage() {
  const [activeSection, setActiveSection] = useState<ProfileSection>('apiKeys')
  const [records, setRecords] = useState<CsvStorageRecord[]>([])
  const [filesError, setFilesError] = useState('')
  const [isFilesLoading, setIsFilesLoading] = useState(true)
  const [isClearingData, setIsClearingData] = useState(false)

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.updatedAt - a.updatedAt),
    [records],
  )

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

  const onDeleteRecord = async (mode: CsvStorageMode): Promise<void> => {
    setFilesError('')
    try {
      await deleteCsvRecord(mode)
      setRecords((currentRecords) => currentRecords.filter((record) => record.mode !== mode))
    } catch {
      setFilesError('Не удалось удалить файл из локального хранилища.')
    }
  }

  const onClearLocalData = async (): Promise<void> => {
    setFilesError('')
    setIsClearingData(true)
    try {
      await clearCsvRecords()
      if (typeof window !== 'undefined') {
        LOCAL_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key))
      }
      setRecords([])
    } catch {
      setFilesError('Не удалось очистить локальные данные.')
    } finally {
      setIsClearingData(false)
    }
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
        </div>
      </header>

      <div className={cn(`${BLOCK_NAME}__layout`)}>
        <aside className={cn(`${BLOCK_NAME}__sidebar`)} aria-label="Разделы профиля">
          {PROFILE_SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              className={cn(`${BLOCK_NAME}__section-button`, {
                [`${BLOCK_NAME}__section-button--active`]: activeSection === section.key,
              })}
              onClick={() => setActiveSection(section.key)}
            >
              <span className={cn(`${BLOCK_NAME}__section-title`)}>
                {section.title}
              </span>
              <span className={cn(`${BLOCK_NAME}__section-description`)}>
                {section.description}
              </span>
            </button>
          ))}
        </aside>

        <section className={cn(`${BLOCK_NAME}__content`)}>
          {activeSection === 'apiKeys' && (
            <UiPanel title="API-ключи">
              <Alert
                type="info"
                showIcon
                message="Ключи требуют серверного хранения"
                description="На фронтенде можно собрать форму подключения, но реальные токены Ozon и Wildberries безопаснее сохранять только через backend."
              />
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
                  <label className={cn(`${BLOCK_NAME}__field`)}>
                    <span>Client ID</span>
                    <Input placeholder="Будет доступно после подключения backend" disabled />
                  </label>
                  <label className={cn(`${BLOCK_NAME}__field`)}>
                    <span>API Key</span>
                    <Input.Password placeholder="Будет доступно после подключения backend" disabled />
                  </label>
                  <Tag color="default" className={cn(`${BLOCK_NAME}__status-tag`)}>Не подключено</Tag>
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
                  <label className={cn(`${BLOCK_NAME}__field`)}>
                    <span>Token</span>
                    <Input.Password placeholder="Будет доступно после подключения backend" disabled />
                  </label>
                  <label className={cn(`${BLOCK_NAME}__field`)}>
                    <span>Статус</span>
                    <Input value="Не подключено" disabled />
                  </label>
                  <Tag color="default" className={cn(`${BLOCK_NAME}__status-tag`)}>Не подключено</Tag>
                </UiCard>
              </div>
            </UiPanel>
          )}

          {activeSection === 'uploadedFiles' && (
            <UiPanel
              title="Загруженные файлы"
              headActions={(
                <Button icon={<ReloadOutlined />} onClick={() => void loadRecords()} loading={isFilesLoading}>
                  Обновить
                </Button>
              )}
            >
              {filesError && <Alert type="error" showIcon message={filesError} />}
              {sortedRecords.length === 0 ? (
                <UiCard className={cn(`${BLOCK_NAME}__empty-state`)}>
                  <DatabaseOutlined className={cn(`${BLOCK_NAME}__empty-icon`)} />
                  <Typography variant="h3" color="accent">
                    Файлы не загружены
                  </Typography>
                  <Typography variant="body2" color="muted">
                    После загрузки отчетов Ozon, Wildberries или себестоимости они появятся в этом списке.
                  </Typography>
                </UiCard>
              ) : (
                <div className={cn(`${BLOCK_NAME}__file-list`)}>
                  {sortedRecords.map((record) => {
                    const meta = CSV_RECORD_META[record.mode]
                    return (
                      <UiCard key={record.mode} padding="sm" className={cn(`${BLOCK_NAME}__file-card`)}>
                        <div className={cn(`${BLOCK_NAME}__file-main`)}>
                          <div>
                            <div className={cn(`${BLOCK_NAME}__file-tags`)}>
                              <Tag color={meta.marketplace === 'Ozon' ? 'blue' : 'purple'}>{meta.marketplace}</Tag>
                              <Tag>{meta.kind}</Tag>
                            </div>
                            <Typography variant="h3" color="accent" className={cn(`${BLOCK_NAME}__file-title`)}>
                              {meta.title}
                            </Typography>
                            <Typography variant="body3" color="muted">
                              {record.fileName}
                            </Typography>
                          </div>
                          <div className={cn(`${BLOCK_NAME}__file-meta`)}>
                            <Typography variant="body3" color="muted">
                              {formatDate(record.updatedAt)}
                            </Typography>
                            <Typography variant="body3" color="muted">
                              {formatSize(record.csvText)}
                            </Typography>
                          </div>
                        </div>
                        <Popconfirm
                          title="Удалить файл?"
                          description="Отчет пропадет из локального хранилища."
                          okText="Удалить"
                          cancelText="Отмена"
                          onConfirm={() => void onDeleteRecord(record.mode)}
                        >
                          <Button danger icon={<DeleteOutlined />}>
                            Удалить
                          </Button>
                        </Popconfirm>
                      </UiCard>
                    )
                  })}
                </div>
              )}
            </UiPanel>
          )}

          {activeSection === 'dataSecurity' && (
            <UiPanel title="Данные и безопасность">
              {filesError && <Alert type="error" showIcon message={filesError} />}
              <div className={cn(`${BLOCK_NAME}__cards-grid`)}>
                <UiCard>
                  <div className={cn(`${BLOCK_NAME}__card-head`)}>
                    <LockOutlined className={cn(`${BLOCK_NAME}__card-icon`)} />
                    <div>
                      <Typography variant="h3" color="accent" className={cn(`${BLOCK_NAME}__card-title`)}>
                        Локальные файлы
                      </Typography>
                      <Typography variant="body3" color="muted">
                        Отчеты хранятся в IndexedDB текущего браузера.
                      </Typography>
                    </div>
                  </div>
                  <Typography variant="body2" color="accent" semiBold>
                    Сохранено файлов: {records.length}
                  </Typography>
                </UiCard>

                <UiCard>
                  <div className={cn(`${BLOCK_NAME}__card-head`)}>
                    <SafetyOutlined className={cn(`${BLOCK_NAME}__card-icon`)} />
                    <div>
                      <Typography variant="h3" color="accent" className={cn(`${BLOCK_NAME}__card-title`)}>
                        Настройки расчетов
                      </Typography>
                      <Typography variant="body3" color="muted">
                        НДС, налог и режим сопоставления хранятся в localStorage.
                      </Typography>
                    </div>
                  </div>
                  <Typography variant="body2" color="accent" semiBold>
                    Ключей настроек: {LOCAL_STORAGE_KEYS.length}
                  </Typography>
                </UiCard>
              </div>

              <UiCard className={cn(`${BLOCK_NAME}__danger-card`)}>
                <div>
                  <Typography variant="h3" color="negative" className={cn(`${BLOCK_NAME}__card-title`)}>
                    Очистить локальные данные
                  </Typography>
                  <Typography variant="body2" color="muted">
                    Удалит загруженные отчеты, файлы себестоимости и сохраненные параметры расчетов.
                  </Typography>
                </div>
                <Popconfirm
                  title="Очистить локальные данные?"
                  description="Действие нельзя отменить."
                  okText="Очистить"
                  cancelText="Отмена"
                  onConfirm={() => void onClearLocalData()}
                >
                  <Button danger icon={<DeleteOutlined />} loading={isClearingData}>
                    Очистить данные
                  </Button>
                </Popconfirm>
              </UiCard>
            </UiPanel>
          )}
        </section>
      </div>
    </main>
  )
}
