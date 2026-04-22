import classNames from 'classnames/bind'
import type { ChangeEvent } from 'react'
import { Typography, UiPanel } from '@/shared/ui-kit'
import styles from './ReportUploadPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ReportUploadPanel'

type ReportUploadPanelProps = {
  isProcessing: boolean
  hasResults: boolean
  fileName: string
  error: string
  showWildberriesWarning: boolean
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onDownloadPdf: () => void
}

export function ReportUploadPanel({
  isProcessing,
  hasResults,
  fileName,
  error,
  showWildberriesWarning,
  onFileUpload,
  onDownloadPdf,
}: ReportUploadPanelProps) {
  return (
    <UiPanel className={cn(BLOCK_NAME)} title="Загрузка файла">
      <div className={cn(`${BLOCK_NAME}__row`)}>
        <input className={cn(`${BLOCK_NAME}__file-input`)} type="file" accept=".csv,text/csv" onChange={onFileUpload} disabled={isProcessing} />
        <button
          className={cn(`${BLOCK_NAME}__download-button`)}
          type="button"
          onClick={onDownloadPdf}
          disabled={isProcessing || !hasResults}
        >
          <Typography as="span" variant="body2" color="accent">Скачать в PDF</Typography>
        </button>
      </div>
      {isProcessing && (
        <Typography variant="body2" color="accent" className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--loader`)}>
          Анализирую файл, подождите…
        </Typography>
      )}
      {fileName && (
        <Typography variant="body2" color="accent" className={cn(`${BLOCK_NAME}__file-meta`)}>
          Файл: {fileName}
        </Typography>
      )}
      {showWildberriesWarning && (
        <Typography variant="body2" color="warning" className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--warning`)}>
          Расчёт для Wildberries пока в разработке. Переключитесь на вкладку Ozon.
        </Typography>
      )}
      {error && (
        <Typography variant="body2" color="negative" className={cn(`${BLOCK_NAME}__notice`, `${BLOCK_NAME}__notice--error`)}>
          {error}
        </Typography>
      )}
    </UiPanel>
  )
}
