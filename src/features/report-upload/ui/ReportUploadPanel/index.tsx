import classNames from 'classnames/bind'
import { ExclamationCircleFilled } from '@ant-design/icons'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import Tooltip from 'antd/es/tooltip'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { UiCard } from '@/shared/ui-kit/card'
import { UiFlex } from '@/shared/ui-kit/flex'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ReportUploadPanel'

type ReportUploadPanelProps = {
  isProcessing: boolean
  hasResults: boolean
  fileName: string
  primaryFileLabel?: string
  secondaryFileName?: string
  secondaryFileLabel?: string
  secondaryFileHint?: string
  secondaryUsageNote?: string
  secondaryMissingArticles?: string[]
  secondaryAlertText?: string
  error: string
  showWildberriesWarning: boolean
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onSecondaryFileUpload?: (event: ChangeEvent<HTMLInputElement>) => void
  onDownloadPdf: () => void
}

export function ReportUploadPanel({
  isProcessing,
  hasResults,
  fileName,
  primaryFileLabel = '',
  secondaryFileName = '',
  secondaryFileLabel = 'CSV себестоимости товаров (опционально)',
  secondaryFileHint = '',
  secondaryUsageNote = '',
  secondaryMissingArticles = [],
  secondaryAlertText = '',
  error,
  showWildberriesWarning,
  onFileUpload,
  onSecondaryFileUpload,
  onDownloadPdf,
}: ReportUploadPanelProps) {
  const [isMissingCopied, setIsMissingCopied] = useState(false)
  const primaryFileInputRef = useRef<HTMLInputElement | null>(null)
  const secondaryFileInputRef = useRef<HTMLInputElement | null>(null)
  const hasMissingArticles = secondaryMissingArticles.length > 0

  const copyMissingArticles = async (): Promise<void> => {
    if (!hasMissingArticles) return
    try {
      await navigator.clipboard.writeText(secondaryMissingArticles.join(', '))
      setIsMissingCopied(true)
      window.setTimeout(() => setIsMissingCopied(false), 1200)
    } catch {
      setIsMissingCopied(false)
    }
  }

  return (
    <UiPanel className={cn(BLOCK_NAME)} title="Загрузка файла">
      <UiCard className={cn(`${BLOCK_NAME}__upload-card`)} padding="sm">
        {primaryFileLabel && (
          <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
            {primaryFileLabel}
          </Typography>
        )}
        <input
          ref={primaryFileInputRef}
          className={cn(`${BLOCK_NAME}__hidden-file-input`)}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={onFileUpload}
          disabled={isProcessing}
        />
        <UiFlex wrap="wrap" align="center" justify="between" gap={10}>
          <Button
            type="primary"
            onClick={() => primaryFileInputRef.current?.click()}
            disabled={isProcessing}
          >
            Выбрать файл
          </Button>
          <Button
            onClick={onDownloadPdf}
            disabled={isProcessing || !hasResults}
          >
            Скачать отчет
          </Button>
        </UiFlex>
        <Typography
          variant="body3"
          color={fileName ? 'accent' : 'muted'}
          semiBold={Boolean(fileName)}
          className={cn(`${BLOCK_NAME}__file-meta`)}
        >
          {fileName ? `Загружен: ${fileName}` : 'Файл не выбран'}
        </Typography>
      </UiCard>

      {onSecondaryFileUpload && (
        <UiCard className={cn(`${BLOCK_NAME}__upload-card`)} padding="sm">
          <div className={cn(`${BLOCK_NAME}__title-row`)}>
            <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
              {secondaryFileLabel}
            </Typography>
            {secondaryUsageNote && (
              <Tooltip title={secondaryUsageNote}>
                <button
                  type="button"
                  className={cn(`${BLOCK_NAME}__usage-tooltip-trigger`)}
                  aria-label="Информация о применяемом файле себестоимости"
                >
                  <ExclamationCircleFilled />
                </button>
              </Tooltip>
            )}
          </div>
          {secondaryFileHint && (
            <Typography variant="body3" color="muted" semiBold className={cn(`${BLOCK_NAME}__secondary-note`)}>
              {secondaryFileHint}
            </Typography>
          )}
          <input
            ref={secondaryFileInputRef}
            className={cn(`${BLOCK_NAME}__hidden-file-input`)}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={onSecondaryFileUpload}
            disabled={isProcessing}
          />
          <UiFlex wrap="wrap" align="center" gap={10}>
            <Button
              type="default"
              onClick={() => secondaryFileInputRef.current?.click()}
              disabled={isProcessing}
            >
              Выбрать файл
            </Button>
          </UiFlex>
          <Typography
            variant="body3"
            color={secondaryFileName ? 'accent' : 'muted'}
            semiBold={Boolean(secondaryFileName)}
            className={cn(`${BLOCK_NAME}__file-meta`)}
          >
            {secondaryFileName ? `Загружен: ${secondaryFileName}` : 'Файл не выбран'}
          </Typography>
          {hasMissingArticles && (
            <div className={cn(`${BLOCK_NAME}__secondary-alert`)}>
              <Typography variant="body2" color="negative" className={cn(`${BLOCK_NAME}__secondary-alert-text`)}>
                {secondaryAlertText || 'Таблица себестоимости неполная: не найдены артикулы из основного отчета.'}
              </Typography>
              <UiFlex align="center" gap={8}>
                <Button
                  className={cn(`${BLOCK_NAME}__copy-missing-button`)}
                  onClick={() => void copyMissingArticles()}
                >
                  Скопировать артикулы
                </Button>
                {isMissingCopied && (
                  <Typography as="span" variant="caption" color="negative" semiBold>
                    Скопировано
                  </Typography>
                )}
              </UiFlex>
              <code className={cn(`${BLOCK_NAME}__missing-list`)}>
                {secondaryMissingArticles.join(', ')}
              </code>
            </div>
          )}
        </UiCard>
      )}

      {isProcessing && (
        <Alert
          className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--loader`)}
          message="Анализирую файл, подождите…"
          type="info"
          showIcon
        />
      )}
      {showWildberriesWarning && (
        <Alert
          className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--warning`)}
          message="Расчёт для Wildberries пока в разработке. Переключитесь на вкладку Ozon."
          type="warning"
          showIcon
        />
      )}
      {error && (
        <Alert
          className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--error`)}
          message={error}
          type="error"
          showIcon
        />
      )}
    </UiPanel>
  )
}
