import classNames from 'classnames/bind'
import {createElement, lazy, Suspense, useRef, useState} from 'react'
import {DeleteOutlined, ExclamationCircleFilled} from '@ant-design/icons'
import Button from 'antd/es/button'
import Popconfirm from 'antd/es/popconfirm'
import {WbWeeklyReportManager} from '@/features/report-upload'
import {UnitExtraParamsPanel} from '@/features/unit-extra-params'
import {useWildberriesAnalyticsPage} from '@/pages/wildberries-page/model/useWildberriesAnalyticsPage'
import {UiCard} from '@/shared/ui-kit/card'
import {UiFlex} from '@/shared/ui-kit/flex'
import {InfoTooltip} from '@/shared/ui-kit/tooltip'
import {UiAccordion} from '@/shared/ui-kit/accordion'
import {Typography} from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'WildberriesPage'
const lazyAccrualResults = lazy(async () => import('@/widgets/report-results/ui/AccrualResults').then((module) => ({default: module.AccrualResults})))
const lazyWildberriesTopProductsPanel = lazy(async () => import('@/widgets/report-results/ui/WildberriesTopProductsPanel').then((module) => ({default: module.WildberriesTopProductsPanel})))

export function WildberriesPage() {
  const {
    addWeeklyReport,
    articlePattern,
    cogsFallbackNote,
    cogsFileName,
    cogsMatchingMode,
    downloadPdf,
    error,
    hasResults,
    isArticlePatternExclude,
    isExtraParamsOpen,
    isProcessing,
    missingCogsArticles,
    onCogsFileDelete,
    onCogsFileUpload,
    onTaxRateChange,
    onVatRateChange,
    priceMin,
    priceMax,
    removeWeeklyReport,
    reports,
    setArticlePattern,
    setIsArticlePatternExclude,
    setIsExtraParamsOpen,
    setCogsMatchingMode,
    setPriceMin,
    setPriceMax,
    taxRatePercent,
    topProducts,
    vatRatePercent,
    weeklyReports,
  } = useWildberriesAnalyticsPage()

  const cogsFileInputRef = useRef<HTMLInputElement | null>(null)
  const [isMissingCopied, setIsMissingCopied] = useState(false)

  const hasMissingArticles = missingCogsArticles.length > 0

  const copyMissingArticles = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(missingCogsArticles.join(', '))
      setIsMissingCopied(true)
      window.setTimeout(() => setIsMissingCopied(false), 1200)
    } catch {
      setIsMissingCopied(false)
    }
  }

  return (
    <main className={cn(BLOCK_NAME)}>
      <header className={cn(`${BLOCK_NAME}__hero`)}>
        <Typography variant="caption" color="light" className={cn(`${BLOCK_NAME}__eyebrow`)}>
          Маркетплейс Метрика
        </Typography>
        <Typography as="h1" variant="h1" color="light" className={cn(`${BLOCK_NAME}__title`)}>
          Аналитика Wildberries
        </Typography>
        <Typography as="p" variant="body1" color="light" className={cn(`${BLOCK_NAME}__subtitle`)}>
          Получите полную аналитику просто скачав отчеты в кабинете селлера и загрузив их в формате CSV или Excel.
        </Typography>
      </header>

      <UnitExtraParamsPanel
        isOpen={isExtraParamsOpen}
        isAccrualMode
        accrualArticlePattern={articlePattern}
        accrualArticlePatternExclude={isArticlePatternExclude}
        cogsMatchingMode={cogsMatchingMode}
        priceMin={priceMin}
        priceMax={priceMax}
        vatRatePercent={vatRatePercent}
        taxRatePercent={taxRatePercent}
        onToggleOpen={() => setIsExtraParamsOpen((prev) => !prev)}
        onAccrualArticlePatternChange={setArticlePattern}
        onAccrualArticlePatternExcludeChange={setIsArticlePatternExclude}
        onCogsMatchingModeChange={setCogsMatchingMode}
        onPriceMinChange={setPriceMin}
        onPriceMaxChange={setPriceMax}
        onVatRateChange={onVatRateChange}
        onTaxRateChange={onTaxRateChange}
      />

      <UiAccordion title={(
          <Typography as="span" variant="h3" color="accent">
            Загрузка файла
          </Typography>
        )}
        defaultOpen contentInnerClassName={cn(`${BLOCK_NAME}__upload-content`)}>
        <UiCard padding="sm">
          <WbWeeklyReportManager
            weeklyReports={weeklyReports}
            isProcessing={isProcessing}
            error={error}
            hasResults={hasResults}
            onAddReport={addWeeklyReport}
            onRemoveReport={removeWeeklyReport}
            onDownloadPdf={downloadPdf}
          />
        </UiCard>

        <UiCard padding="sm">
          <UiFlex direction='column' gap={'10px'}>
            <div className={cn(`${BLOCK_NAME}__cogs-title-row`)}>
              <Typography variant="body2" semiBold color="accent">
                Себестоимость товаров
              </Typography>
              {cogsFallbackNote && (
                <InfoTooltip
                  ariaLabel="Информация о применяемом файле себестоимости"
                  content={cogsFallbackNote}
                  icon={(
                    <span aria-hidden="true">
                    <ExclamationCircleFilled/>
                  </span>
                  )}
                />
              )}
            </div>
            <Typography variant="body3" color="muted" semiBold>
              Добавьте файл себестоимости, чтобы получить точный отчет. Обязательные
              колонки: &quot;Артикул&quot; и &quot;Себестоимость&quot;.
            </Typography>
            <input
              ref={cogsFileInputRef}
              style={{display: 'none'}}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={onCogsFileUpload}
              disabled={isProcessing}
            />
            <UiFlex align="center" gap={8}>
              <Button
                type="default"
                onClick={() => cogsFileInputRef.current?.click()}
                disabled={isProcessing}
              >
                {cogsFileName ? 'Загрузить свежий файл' : 'Выбрать файл'}
              </Button>
              {cogsFileName && (
                <Popconfirm
                  title="Удалить файл?"
                  description="Отчет пропадет из локального хранилища."
                  okText="Удалить"
                  cancelText="Отмена"
                  onConfirm={onCogsFileDelete}
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
              color={cogsFileName ? 'accent' : 'muted'}
              semiBold={Boolean(cogsFileName)}
            >
              {cogsFileName ? `Загружен: ${cogsFileName}` : 'Файл не выбран'}
            </Typography>
            {hasMissingArticles && (
              <div className={cn(`${BLOCK_NAME}__cogs-alert`)}>
                <Typography variant="body2" color="negative">
                  Таблица себестоимости неполная: отсутствуют артикулы из основного отчета. Расчет будет неполным.
                </Typography>
                <UiFlex align="center" gap={8}>
                  <Button onClick={() => void copyMissingArticles()}>
                    Скопировать артикулы
                  </Button>
                  {isMissingCopied && (
                    <Typography as="span" variant="caption" color="negative" semiBold>
                      Скопировано
                    </Typography>
                  )}
                </UiFlex>
                <code className={cn(`${BLOCK_NAME}__missing-list`)}>
                  {missingCogsArticles.join(', ')}
                </code>
              </div>
            )}
          </UiFlex>
        </UiCard>
      </UiAccordion>

      {reports && (
        <Suspense fallback={null}>
          {createElement(lazyAccrualResults, {
            reports,
            showAccrualOverview: true,
            cogsMissingValueText: 'Нет данных: загрузите CSV с себестоимостью товаров',
            isWildberries: true,
          })}
        </Suspense>
      )}

      {topProducts.length > 0 && (
        <Suspense fallback={null}>
          {createElement(lazyWildberriesTopProductsPanel, {items: topProducts})}
        </Suspense>
      )}
    </main>
  )
}
