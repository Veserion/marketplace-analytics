import classNames from 'classnames/bind'
import { DatabaseOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import Popconfirm from 'antd/es/popconfirm'
import Tag from 'antd/es/tag'
import type { CsvStorageMode, CsvStorageRecord } from '@/shared/lib/indexed-db'
import { UiCard } from '@/shared/ui-kit/card'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from '../index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProfilePage'

type CsvRecordMeta = {
  title: string
  marketplace: string
  kind: string
}

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
  wildberriesWeekly1: {
    title: 'Wildberries: еженедельный отчёт (слот 1)',
    marketplace: 'Wildberries',
    kind: 'Еженедельный отчёт',
  },
  wildberriesWeekly2: {
    title: 'Wildberries: еженедельный отчёт (слот 2)',
    marketplace: 'Wildberries',
    kind: 'Еженедельный отчёт',
  },
  wildberriesWeekly3: {
    title: 'Wildberries: еженедельный отчёт (слот 3)',
    marketplace: 'Wildberries',
    kind: 'Еженедельный отчёт',
  },
  wildberriesWeekly4: {
    title: 'Wildberries: еженедельный отчёт (слот 4)',
    marketplace: 'Wildberries',
    kind: 'Еженедельный отчёт',
  },
  wildberriesWeekly5: {
    title: 'Wildberries: еженедельный отчёт (слот 5)',
    marketplace: 'Wildberries',
    kind: 'Еженедельный отчёт',
  },
  wildberriesWeekly6: {
    title: 'Wildberries: еженедельный отчёт (слот 6)',
    marketplace: 'Wildberries',
    kind: 'Еженедельный отчёт',
  },
  wildberriesWeekly7: {
    title: 'Wildberries: еженедельный отчёт (слот 7)',
    marketplace: 'Wildberries',
    kind: 'Еженедельный отчёт',
  },
  wildberriesWeekly8: {
    title: 'Wildberries: еженедельный отчёт (слот 8)',
    marketplace: 'Wildberries',
    kind: 'Еженедельный отчёт',
  },
}

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

type UploadedFilesSectionProps = {
  records: CsvStorageRecord[]
  filesError: string
  isFilesLoading: boolean
  onLoadRecords: () => void
  onDeleteRecord: (mode: CsvStorageMode) => void
}

export function UploadedFilesSection({
  records,
  filesError,
  isFilesLoading,
  onLoadRecords,
  onDeleteRecord,
}: UploadedFilesSectionProps) {
  const sortedRecords = [...records].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <UiPanel
      title="Загруженные файлы"
      headActions={(
        <Button icon={<ReloadOutlined />} onClick={onLoadRecords} loading={isFilesLoading}>
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
                  onConfirm={() => onDeleteRecord(record.mode)}
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
  )
}
