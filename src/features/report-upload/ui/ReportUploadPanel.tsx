import classNames from 'classnames/bind'
import {useState} from 'react'
import type {ChangeEvent} from 'react'
import {Typography, UiPanel} from '@/shared/ui-kit'
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
                                    secondaryMissingArticles = [],
                                    secondaryAlertText = '',
                                    error,
                                    showWildberriesWarning,
                                    onFileUpload,
                                    onSecondaryFileUpload,
                                    onDownloadPdf,
                                  }: ReportUploadPanelProps) {
  const [isMissingCopied, setIsMissingCopied] = useState(false)
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
      <div className={cn(`${BLOCK_NAME}__primary`)}>
        <div className={cn(`${BLOCK_NAME}__upload-card`)}>
          {primaryFileLabel && (
            <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
              {primaryFileLabel}
            </Typography>
          )}
          <div className={cn(`${BLOCK_NAME}__row`)}>
            <input className={cn(`${BLOCK_NAME}__file-input`)} type="file" accept=".csv,text/csv"
                   onChange={onFileUpload} disabled={isProcessing}/>
            <button
              className={cn(`${BLOCK_NAME}__download-button`)}
              type="button"
              onClick={onDownloadPdf}
              disabled={isProcessing || !hasResults}
            >
              <Typography as="span" variant="body2" color="accent" semiBold>Скачать отчет</Typography>
            </button>
          </div>
          {fileName && (
            <Typography variant="body2" color="accent" semiBold className={cn(`${BLOCK_NAME}__file-meta`)}>
              Файл: {fileName}
            </Typography>
          )}
        </div>
      </div>

      {onSecondaryFileUpload && (
        <div className={cn(`${BLOCK_NAME}__secondary`)}>
          <div className={cn(`${BLOCK_NAME}__upload-card`)}>
            <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
              {secondaryFileLabel}
            </Typography>
            {secondaryFileHint && (
              <Typography variant="body3" color="muted" semiBold className={cn(`${BLOCK_NAME}__secondary-hint`)}>
                {secondaryFileHint}
              </Typography>
            )}
            <input
              className={cn(`${BLOCK_NAME}__file-input`)}
              type="file"
              accept=".csv,text/csv"
              onChange={onSecondaryFileUpload}
              disabled={isProcessing}
            />
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
                <div className={cn(`${BLOCK_NAME}__secondary-alert-actions`)}>
                  <button
                    type="button"
                    className={cn(`${BLOCK_NAME}__copy-missing-button`)}
                    onClick={() => void copyMissingArticles()}
                  >
                    <Typography as="span" variant="body3" color="negative" semiBold>
                      Скопировать артикулы
                    </Typography>
                  </button>
                  {isMissingCopied && (
                    <Typography as="span" variant="caption" color="negative" semiBold>
                      Скопировано
                    </Typography>
                  )}
                </div>
                <code className={cn(`${BLOCK_NAME}__missing-list`)}>
                  {secondaryMissingArticles.join(', ')}
                </code>
              </div>
            )}
          </div>
        </div>
      )}

      {isProcessing && (
        <Typography variant="body2" color="accent"
                    className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--loader`)}>
          Анализирую файл, подождите…
        </Typography>
      )}
      {showWildberriesWarning && (
        <Typography variant="body2" color="warning"
                    className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--warning`)}>
          Расчёт для Wildberries пока в разработке. Переключитесь на вкладку Ozon.
        </Typography>
      )}
      {error && (
        <Typography variant="body2" color="negative"
                    className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--error`)}>
          {error}
        </Typography>
      )}
    </UiPanel>
  )
}
