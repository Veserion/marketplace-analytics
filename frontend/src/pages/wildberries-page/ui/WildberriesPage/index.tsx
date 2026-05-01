import classNames from 'classnames/bind'
import { createElement, lazy, Suspense } from 'react'
import { ReportUploadPanel } from '@/features/report-upload'
import { UnitExtraParamsPanel } from '@/features/unit-extra-params'
import { useWildberriesAnalyticsPage } from '@/pages/wildberries-page/model/useWildberriesAnalyticsPage'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'WildberriesPage'
const lazyAccrualResults = lazy(async () => import('@/widgets/report-results/ui/AccrualResults').then((module) => ({ default: module.AccrualResults })))
const lazyWildberriesTopProductsPanel = lazy(async () => import('@/widgets/report-results/ui/WildberriesTopProductsPanel').then((module) => ({ default: module.WildberriesTopProductsPanel })))

export function WildberriesPage() {
  const {
    articlePattern,
    cogsFallbackNote,
    cogsFileName,
    cogsMatchingMode,
    downloadPdf,
    error,
    fileName,
    foreignFileName,
    foreignReportLabel,
    uploadStatusText,
    hasResults,
    isArticlePatternExclude,
    isExtraParamsOpen,
    isProcessing,
    missingCogsArticles,
    onCogsFileUpload,
    onCogsFileDelete,
    onForeignFileUpload,
    onForeignFileDelete,
    onFileUpload,
    onPrimaryFileDelete,
    setIsArticlePatternExclude,
    setCogsMatchingMode,
    onTaxRateChange,
    onVatRateChange,
    reports,
    setArticlePattern,
    setIsExtraParamsOpen,
    taxRatePercent,
    topProducts,
    vatRatePercent,
  } = useWildberriesAnalyticsPage()

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
        vatRatePercent={vatRatePercent}
        taxRatePercent={taxRatePercent}
        onToggleOpen={() => setIsExtraParamsOpen((prev) => !prev)}
        onAccrualArticlePatternChange={setArticlePattern}
        onAccrualArticlePatternExcludeChange={setIsArticlePatternExclude}
        onCogsMatchingModeChange={setCogsMatchingMode}
        onVatRateChange={onVatRateChange}
        onTaxRateChange={onTaxRateChange}
      />

      <ReportUploadPanel
        isProcessing={isProcessing}
        hasResults={hasResults}
        fileName={fileName}
        primaryFileLabel="Еженедельный детализированный отчет"
        primaryUploadStatusText={uploadStatusText}
        additionalPrimaryFileName={foreignFileName}
        additionalPrimaryFileLabel={foreignReportLabel}
        secondaryFileName={cogsFileName}
        secondaryFileLabel="Себестоимость товаров"
        secondaryFileHint='Добавьте файл себестоимости, чтобы получить точный отчет. Обязательные колонки: "Артикул" и "Себестоимость".'
        secondaryUsageNote={cogsFallbackNote}
        secondaryMissingArticles={missingCogsArticles}
        secondaryAlertText="Таблица себестоимости неполная: отсутствуют артикулы из основного отчета. Расчет будет неполным."
        error={error}
        showWildberriesWarning={false}
        onFileUpload={onFileUpload}
        onAdditionalPrimaryFileUpload={onForeignFileUpload}
        onAdditionalPrimaryFileDelete={onForeignFileDelete}
        onSecondaryFileUpload={onCogsFileUpload}
        onSecondaryFileDelete={onCogsFileDelete}
        onPrimaryFileDelete={onPrimaryFileDelete}
        onDownloadPdf={downloadPdf}
      />

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
          {createElement(lazyWildberriesTopProductsPanel, { items: topProducts })}
        </Suspense>
      )}
    </main>
  )
}
