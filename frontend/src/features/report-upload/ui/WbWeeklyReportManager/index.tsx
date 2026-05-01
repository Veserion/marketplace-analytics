import classNames from 'classnames/bind'
import { DeleteOutlined, ExclamationCircleFilled, SwapOutlined } from '@ant-design/icons'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import Popconfirm from 'antd/es/popconfirm'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { WbUploadedReport } from '@/entities/wildberries-report'
import { MAX_WEEKLY_REPORTS } from '@/entities/wildberries-report'
import { UiFlex } from '@/shared/ui-kit/flex'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'WbWeeklyReportManager'

type WbWeeklyReportManagerProps = {
  weeklyReports: WbUploadedReport[]
  isProcessing: boolean
  error: string
  hasResults: boolean
  onAddReport: (file: File, replaceId?: string) => Promise<{ duplicate?: WbUploadedReport; added: boolean }>
  onRemoveReport: (reportId: string) => Promise<void>
  onDownloadPdf: () => void
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return 'Период не определён'
  return start === end ? start : `${start} – ${end}`
}

function buildStatusText(reports: WbUploadedReport[]): string {
  const readyReports = reports.filter((r) => r.status === 'ready')
  if (readyReports.length === 0) return 'Отчёты не загружены'

  const period = formatPeriod(
    readyReports.reduce((min, r) => (!min || (r.periodStart ?? '') < min ? r.periodStart : min), null as string | null),
    readyReports.reduce((max, r) => (!max || (r.periodEnd ?? '') > max ? r.periodEnd : max), null as string | null),
  )

  if (readyReports.length === 1) {
    return `Аналитика строится по отчёту ${period}`
  }

  return `Аналитика строится по ${readyReports.length} отчётам за период ${period}`
}

export function WbWeeklyReportManager({
  weeklyReports,
  isProcessing,
  error,
  hasResults,
  onAddReport,
  onRemoveReport,
  onDownloadPdf,
}: WbWeeklyReportManagerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  const [duplicateConfirm, setDuplicateConfirm] = useState<WbUploadedReport | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const readyCount = weeklyReports.filter((r) => r.status === 'ready').length
  const isMaxed = readyCount >= MAX_WEEKLY_REPORTS

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return

    const result = await onAddReport(file)
    if (result.duplicate) {
      setPendingFile(file)
      setDuplicateConfirm(result.duplicate)
    }

    event.target.value = ''
  }

  const handleReplaceSelect = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file || !replaceTargetId) return

    await onAddReport(file, replaceTargetId)
    setReplaceTargetId(null)
    event.target.value = ''
  }

  const handleDuplicateConfirm = async (): Promise<void> => {
    if (!duplicateConfirm || !pendingFile) return
    await onAddReport(pendingFile, duplicateConfirm.id)
    setDuplicateConfirm(null)
    setPendingFile(null)
  }

  const handleDuplicateCancel = (): void => {
    setDuplicateConfirm(null)
    setPendingFile(null)
  }

  const handleReplaceClick = (reportId: string): void => {
    setReplaceTargetId(reportId)
    setTimeout(() => replaceInputRef.current?.click(), 0)
  }

  return (
    <div className={cn(BLOCK_NAME)}>
      <div className={cn(`${BLOCK_NAME}__header`)}>
        <div className={cn(`${BLOCK_NAME}__header-text`)}>
          <Typography variant="body2" semiBold>
            Еженедельные детализированные отчёты
          </Typography>
          <Typography variant="body3" color="muted">
            Загрузите до 8 отчётов WB за месяц для объединённой аналитики.
          </Typography>
        </div>
        <Button
          onClick={onDownloadPdf}
          disabled={isProcessing || !hasResults}
        >
          Скачать метрики в PDF
        </Button>
      </div>

      {readyCount > 0 && (
        <Typography variant="body3" color="accent" className={cn(`${BLOCK_NAME}__counter`)}>
          {`Загружено ${readyCount} из ${MAX_WEEKLY_REPORTS} отчётов`}
        </Typography>
      )}

      {weeklyReports.length === 0 && (
        <Button
          type="primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
        >
          Загрузить отчёт
        </Button>
      )}

      {weeklyReports.map((report) => (
        <div key={report.id} className={cn(`${BLOCK_NAME}__card`)}>
          <div className={cn(`${BLOCK_NAME}__card-period`)}>
            <Typography variant="body3" semiBold>
              {formatPeriod(report.periodStart, report.periodEnd)}
            </Typography>
            {!report.periodStart && (
              <ExclamationCircleFilled style={{ color: 'var(--color-warning, #faad14)', fontSize: 14 }} />
            )}
          </div>
          <Typography variant="body3" color="muted">
            {report.fileName}
          </Typography>
          {report.status === 'error' && report.errorMessage && (
            <div className={cn(`${BLOCK_NAME}__card-error`)}>
              <Alert type="error" message={report.errorMessage} showIcon={false} banner={false} />
            </div>
          )}
          <UiFlex align="center" gap={8} className={cn(`${BLOCK_NAME}__card-actions`)}>
            <Button
              size="small"
              icon={<SwapOutlined />}
              disabled={isProcessing}
              onClick={() => handleReplaceClick(report.id)}
            >
              Заменить
            </Button>
            <Popconfirm
              title="Удалить отчёт?"
              description="Отчёт пропадет из локального хранилища."
              okText="Удалить"
              cancelText="Отмена"
              onConfirm={() => onRemoveReport(report.id)}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={isProcessing}
              >
                Удалить
              </Button>
            </Popconfirm>
          </UiFlex>
        </div>
      ))}

      {weeklyReports.length > 0 && (
        <div className={cn(`${BLOCK_NAME}__add-btn`)}>
          <Button
            type="dashed"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing || isMaxed}
          >
            + Добавить отчёт
          </Button>
          {isMaxed && (
            <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__max-hint`)}>
              Достигнут максимум: 8 отчётов. Удалите один отчёт, чтобы загрузить новый.
            </Typography>
          )}
        </div>
      )}

      {duplicateConfirm && (
        <Popconfirm
          title={`Отчёт за ${formatPeriod(duplicateConfirm.periodStart, duplicateConfirm.periodEnd)} уже загружен. Заменить его?`}
          okText="Заменить"
          cancelText="Отмена"
          onConfirm={handleDuplicateConfirm}
          onCancel={handleDuplicateCancel}
          open={Boolean(duplicateConfirm)}
          onOpenChange={(open) => { if (!open) handleDuplicateCancel() }}
        />
      )}

      {error && <Alert type="error" message={error} showIcon />}

      <Typography variant="body3" color={readyCount > 0 ? 'accent' : 'muted'} className={cn(`${BLOCK_NAME}__status`)}>
        {buildStatusText(weeklyReports)}
      </Typography>

      <input
        ref={fileInputRef}
        className={cn(`${BLOCK_NAME}__hidden-file-input`)}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={handleFileSelect}
        disabled={isProcessing}
      />
      <input
        ref={replaceInputRef}
        className={cn(`${BLOCK_NAME}__hidden-file-input`)}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={handleReplaceSelect}
        disabled={isProcessing}
      />
    </div>
  )
}
