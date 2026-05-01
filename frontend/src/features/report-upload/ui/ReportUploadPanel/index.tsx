import classNames from 'classnames/bind'
import {DeleteOutlined, ExclamationCircleFilled} from '@ant-design/icons'
import Alert from 'antd/es/alert'
import Button from 'antd/es/button'
import Popconfirm from 'antd/es/popconfirm'
import {useRef, useState} from 'react'
import type {ChangeEvent} from 'react'
import {UiCard} from '@/shared/ui-kit/card'
import {UiFlex} from '@/shared/ui-kit/flex'
import {UiAccordion} from '@/shared/ui-kit/accordion'
import {InfoTooltip} from '@/shared/ui-kit/tooltip'
import {Typography} from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ReportUploadPanel'

type ReportUploadPanelProps = {
  isProcessing: boolean
  hasResults: boolean
  fileName: string
  primaryFileLabel?: string
  primaryUploadStatusText?: string
  primaryUploadButtonText?: string
  primaryRefreshButtonText?: string
  additionalPrimaryFileName?: string
  additionalPrimaryFileLabel?: string
  additionalPrimaryUploadButtonText?: string
  additionalPrimaryRefreshButtonText?: string
  additionalPrimaryTooltipText?: string
  secondaryFileName?: string
  secondaryFileLabel?: string
  secondaryFileHint?: string
  secondaryUsageNote?: string
  secondaryMissingArticles?: string[]
  secondaryAlertText?: string
  error: string
  showWildberriesWarning: boolean
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onAdditionalPrimaryFileUpload?: (event: ChangeEvent<HTMLInputElement>) => void
  onSecondaryFileUpload?: (event: ChangeEvent<HTMLInputElement>) => void
  onPrimaryFileDelete?: () => void
  onAdditionalPrimaryFileDelete?: () => void
  onSecondaryFileDelete?: () => void
  onDownloadPdf: () => void
}

export function ReportUploadPanel({
                                    isProcessing,
                                    hasResults,
                                    fileName,
                                    primaryFileLabel = '',
                                    primaryUploadStatusText = '',
                                    primaryUploadButtonText = 'Загрузить основной отчет',
                                    primaryRefreshButtonText = 'Обновить основной отчет',
                                    additionalPrimaryFileName = '',
                                    additionalPrimaryFileLabel = 'Отчет по другим странам',
                                    additionalPrimaryUploadButtonText = 'Загрузить отчет по выкупам',
                                    additionalPrimaryRefreshButtonText = 'Обновить отчет по выкупам',
                                    additionalPrimaryTooltipText = 'Небольшой дополнительный отчет WB по продажам в других странах. Скачивается в том же разделе, где основной еженедельный отчет.',
                                    secondaryFileName = '',
                                    secondaryFileLabel = 'CSV себестоимости товаров (опционально)',
                                    secondaryFileHint = '',
                                    secondaryUsageNote = '',
                                    secondaryMissingArticles = [],
                                    secondaryAlertText = '',
                                    error,
                                    showWildberriesWarning,
                                    onFileUpload,
                                    onAdditionalPrimaryFileUpload,
                                    onSecondaryFileUpload,
                                    onPrimaryFileDelete,
                                    onAdditionalPrimaryFileDelete,
                                    onSecondaryFileDelete,
                                    onDownloadPdf,
                                  }: ReportUploadPanelProps) {
  const [isMissingCopied, setIsMissingCopied] = useState(false)
  const primaryFileInputRef = useRef<HTMLInputElement | null>(null)
  const additionalPrimaryFileInputRef = useRef<HTMLInputElement | null>(null)
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
    <UiAccordion className={cn(BLOCK_NAME)} title={(
      <Typography as="span" variant="h3" color="accent">
        Загрузка файла
      </Typography>
    )}
                 defaultOpen contentInnerClassName={cn(`${BLOCK_NAME}__content`)}>
      <UiCard className={cn(`${BLOCK_NAME}__upload-card`)} padding="sm">
        {primaryFileLabel && (
          <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
            {primaryFileLabel}
          </Typography>
        )}
        {primaryUploadButtonText && (
          <input
            ref={primaryFileInputRef}
            className={cn(`${BLOCK_NAME}__hidden-file-input`)}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={onFileUpload}
            disabled={isProcessing}
          />
        )}
        {onAdditionalPrimaryFileUpload && (
          <input
            ref={additionalPrimaryFileInputRef}
            className={cn(`${BLOCK_NAME}__hidden-file-input`)}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={onAdditionalPrimaryFileUpload}
            disabled={isProcessing}
          />
        )}
        <UiFlex wrap="wrap" align="center" justify="between" gap={10}>
          {primaryUploadButtonText && (
            <UiFlex wrap="wrap" align="center" gap={24}>
              <UiFlex align="center" gap={8}>
                <Button
                  type="primary"
                  onClick={() => primaryFileInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  {fileName ? primaryRefreshButtonText : primaryUploadButtonText}
                </Button>
                {fileName && onPrimaryFileDelete && (
                  <Popconfirm
                    title="Удалить файл?"
                    description="Отчет пропадет из локального хранилища."
                    okText="Удалить"
                    cancelText="Отмена"
                    onConfirm={onPrimaryFileDelete}
                  >
                    <Button
                      danger
                      icon={<DeleteOutlined/>}
                      disabled={isProcessing}
                    />
                  </Popconfirm>
                )}
              </UiFlex>
              {onAdditionalPrimaryFileUpload && (
                <UiFlex align="center" gap={8}>
                  <Button
                    type={additionalPrimaryFileName ? 'default' : 'dashed'}
                    onClick={() => additionalPrimaryFileInputRef.current?.click()}
                    disabled={isProcessing}
                  >
                    {additionalPrimaryFileName
                      ? additionalPrimaryRefreshButtonText
                      : additionalPrimaryUploadButtonText}
                  </Button>
                  {additionalPrimaryFileName && onAdditionalPrimaryFileDelete && (
                    <Popconfirm
                      title="Удалить файл?"
                      description="Отчет пропадет из локального хранилища."
                      okText="Удалить"
                      cancelText="Отмена"
                      onConfirm={onAdditionalPrimaryFileDelete}
                    >
                      <Button
                        danger
                        icon={<DeleteOutlined/>}
                        disabled={isProcessing}
                      />
                    </Popconfirm>
                  )}
                  <InfoTooltip
                    ariaLabel="Информация об отчете по другим странам"
                    content={additionalPrimaryTooltipText}
                    icon={(
                      <span className={cn(`${BLOCK_NAME}__additional-tooltip-trigger`)} aria-hidden="true">
                      ?
                    </span>
                    )}
                  />
                </UiFlex>
              )}
            </UiFlex>
          )}
          <div/>
          <Button
            onClick={onDownloadPdf}
            disabled={isProcessing || !hasResults}
          >
            Скачать метрики в PDF
          </Button>
        </UiFlex>
        {primaryUploadButtonText && primaryUploadStatusText ? (
          <Typography
            variant="body3"
            color="accent"
            semiBold
            className={cn(`${BLOCK_NAME}__file-meta`)}
          >
            {primaryUploadStatusText}
          </Typography>
        ) : (
          <>
            <Typography
              variant="body3"
              color={fileName ? 'accent' : 'muted'}
              semiBold={Boolean(fileName)}
              className={cn(`${BLOCK_NAME}__file-meta`)}
            >
              {fileName ? `Загружен: ${fileName}` : 'Файл не выбран'}
            </Typography>
            {onAdditionalPrimaryFileUpload && (
              <Typography
                variant="body3"
                color={additionalPrimaryFileName ? 'accent' : 'muted'}
                semiBold={Boolean(additionalPrimaryFileName)}
                className={cn(`${BLOCK_NAME}__file-meta`)}
              >
                {additionalPrimaryFileName
                  ? `${additionalPrimaryFileLabel}: ${additionalPrimaryFileName}`
                  : `${additionalPrimaryFileLabel}: файл не выбран`}
              </Typography>
            )}
          </>
        )}
      </UiCard>

      {onSecondaryFileUpload && (
        <UiCard className={cn(`${BLOCK_NAME}__upload-card`)} padding="sm">
          <div className={cn(`${BLOCK_NAME}__title-row`)}>
            <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
              {secondaryFileLabel}
            </Typography>
            {secondaryUsageNote && (
              <InfoTooltip
                ariaLabel="Информация о применяемом файле себестоимости"
                content={secondaryUsageNote}
                icon={(
                  <span className={cn(`${BLOCK_NAME}__usage-tooltip-trigger`)} aria-hidden="true">
                    <ExclamationCircleFilled/>
                  </span>
                )}
              />
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
          <UiFlex align="center" gap={8}>
            <Button
              type="default"
              onClick={() => secondaryFileInputRef.current?.click()}
              disabled={isProcessing}
            >
              {secondaryFileName ? 'Загрузить свежий файл' : 'Выбрать файл'}
            </Button>
            {secondaryFileName && onSecondaryFileDelete && (
              <Popconfirm
                title="Удалить файл?"
                description="Отчет пропадет из локального хранилища."
                okText="Удалить"
                cancelText="Отмена"
                onConfirm={onSecondaryFileDelete}
              >
                <Button
                  danger
                  icon={<DeleteOutlined/>}
                  disabled={isProcessing}
                />
              </Popconfirm>
            )}
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
    </UiAccordion>
  )
}
