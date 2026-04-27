import classNames from 'classnames/bind'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import { useId, useRef, useState } from 'react'
import type {ChangeEvent} from 'react'
import { UiCard } from '@/shared/ui-kit/card'
import { UiFlex } from '@/shared/ui-kit/flex'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './ReportUploadPanel.module.scss'

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
  const primaryFileInputId = useId()
  const secondaryFileInputId = useId()
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
        <UiFlex wrap="wrap" align="center" gap={12}>
          <input
            ref={primaryFileInputRef}
            id={primaryFileInputId}
            className={cn(`${BLOCK_NAME}__file-input`)}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileUpload}
            disabled={isProcessing}
          />
          <Button
            className={cn(`${BLOCK_NAME}__file-button`)}
            onClick={() => primaryFileInputRef.current?.click()}
            disabled={isProcessing}
          >
            Выбрать файл
          </Button>
          <Button
            className={cn(`${BLOCK_NAME}__file-button`)}
            onClick={onDownloadPdf}
            disabled={isProcessing || !hasResults}
          >
            Скачать отчет
          </Button>
        </UiFlex>
        {fileName && (
          <Typography variant="body2" color="accent" semiBold className={cn(`${BLOCK_NAME}__file-meta`)}>
            Файл: {fileName}
          </Typography>
        )}
      </UiCard>

      {onSecondaryFileUpload && (
        <UiCard className={cn(`${BLOCK_NAME}__upload-card`)} padding="sm">
          <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
            {secondaryFileLabel}
          </Typography>
          {secondaryFileHint && (
            <Typography variant="body3" color="muted" semiBold className={cn(`${BLOCK_NAME}__secondary-note`)}>
              {secondaryFileHint}
            </Typography>
          )}
          {secondaryUsageNote && (
            <Typography variant="body3" color="accent" semiBold className={cn(`${BLOCK_NAME}__secondary-note`)}>
              {secondaryUsageNote}
            </Typography>
          )}
          <input
            ref={secondaryFileInputRef}
            id={secondaryFileInputId}
            className={cn(`${BLOCK_NAME}__file-input`)}
            type="file"
            accept=".csv,text/csv"
            onChange={onSecondaryFileUpload}
            disabled={isProcessing}
          />
          <Button
            className={cn(`${BLOCK_NAME}__file-button`)}
            onClick={() => secondaryFileInputRef.current?.click()}
            disabled={isProcessing}
          >
            Выбрать файл
          </Button>
          {secondaryFileName && (
            <Typography variant="body2" color="accent" semiBold className={cn(`${BLOCK_NAME}__file-meta`)}>
              Файл себестоимости: {secondaryFileName}
            </Typography>
          )}
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
