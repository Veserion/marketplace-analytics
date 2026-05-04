import classNames from 'classnames/bind'
import { createElement, lazy, Suspense } from 'react'
import { OzonCalculationTabs } from '@/features/ozon-calculation-switcher'
import { ReportUploadPanel, PeriodSelectionPanel } from '@/features/report-upload'
import { UnitExtraParamsPanel } from '@/features/unit-extra-params/ui/UnitExtraParamsPanel'
import { useOzonAnalyticsPage } from '@/pages/analytics-page/model/useAnalyticsPage'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AnalyticsPage'
const lazyUnitEconomicsResults = lazy(async () => import('@/widgets/report-results/ui/UnitEconomicsResults').then((module) => ({ default: module.UnitEconomicsResults })))
const lazyAccrualResults = lazy(async () => import('@/widgets/report-results/ui/AccrualResults').then((module) => ({ default: module.AccrualResults })))

export function AnalyticsPage() {
  const {
    accrualReports,
    accrualArticlePattern,
    articlePattern,
    cogsFallbackNote,
    cogsFileName,
    cogsMatchingMode,
    downloadPdf,
    error,
    fileName,
    hasResults,
    isAccrualArticlePatternExclude,
    isExtraParamsOpen,
    isOzonUnitEconomics,
    isProcessing,
    isUnitArticlePatternExclude,
    isUploadAccordionOpen,
    missingCogsArticles,
    setIsUploadAccordionOpen,
    isMarketplaceConnected,
    onCogsFileUpload,
    onCogsFileDelete,
    onFileUpload,
    onPrimaryFileDelete,
    onSwitchOzonCalculation,
    onTaxRateChange,
    onVatRateChange,
    ozonCalculationType,
    priceMin,
    priceMax,
    setArticlePattern,
    setAccrualArticlePattern,
    setCogsMatchingMode,
    setIsExtraParamsOpen,
    setIsAccrualArticlePatternExclude,
    setIsUnitArticlePatternExclude,
    setPriceMin,
    setPriceMax,
    taxRatePercent,
    unitReports,
    vatRatePercent,
  } = useOzonAnalyticsPage()

  return (
    <main className={cn(BLOCK_NAME)}>
      <header className={cn(`${BLOCK_NAME}__hero`)}>
        <Typography variant="caption" color="light" className={cn(`${BLOCK_NAME}__eyebrow`)}>
          Маркетплейс Метрика
        </Typography>
        <Typography as="h1" variant="h1" color="light" className={cn(`${BLOCK_NAME}__title`)}>
          Аналитика Ozon
        </Typography>
        <Typography as="p" variant="body1" color="light" className={cn(`${BLOCK_NAME}__subtitle`)}>
          Получите полную аналитику просто скачав отчеты в кабинете селлера и загрузив их в формате CSV или Excel.
        </Typography>
      </header>

      <UiPanel title="Вариант расчёта">
        <OzonCalculationTabs value={ozonCalculationType} onChange={onSwitchOzonCalculation} />
      </UiPanel>

      <UnitExtraParamsPanel
        isOpen={isExtraParamsOpen}
        isAccrualMode={!isOzonUnitEconomics}
        unitArticlePattern={articlePattern}
        accrualArticlePattern={accrualArticlePattern}
        unitArticlePatternExclude={isUnitArticlePatternExclude}
        accrualArticlePatternExclude={isAccrualArticlePatternExclude}
        cogsMatchingMode={cogsMatchingMode}
        priceMin={priceMin}
        priceMax={priceMax}
        vatRatePercent={vatRatePercent}
        taxRatePercent={taxRatePercent}
        onToggleOpen={() => setIsExtraParamsOpen((prev) => !prev)}
        onUnitArticlePatternChange={setArticlePattern}
        onAccrualArticlePatternChange={setAccrualArticlePattern}
        onUnitArticlePatternExcludeChange={setIsUnitArticlePatternExclude}
        onAccrualArticlePatternExcludeChange={setIsAccrualArticlePatternExclude}
        onCogsMatchingModeChange={setCogsMatchingMode}
        onPriceMinChange={setPriceMin}
        onPriceMaxChange={setPriceMax}
        onVatRateChange={onVatRateChange}
        onTaxRateChange={onTaxRateChange}
      />

      {isMarketplaceConnected('ozon') && (
        <PeriodSelectionPanel />
      )}

      <ReportUploadPanel
        isProcessing={isProcessing}
        hasResults={hasResults}
        fileName={fileName}
        secondaryFileName={cogsFileName}
        secondaryFileLabel="Себестоимость товаров"
        secondaryFileHint='Добавьте файл себестоимости, чтобы получить точный отчет. Обязательные колонки: "Артикул" и "Себестоимость".'
        secondaryUsageNote={cogsFallbackNote}
        secondaryMissingArticles={missingCogsArticles}
        error={error}
        showWildberriesWarning={false}
        isAccordionOpen={isUploadAccordionOpen}
        onAccordionToggle={setIsUploadAccordionOpen}
        onFileUpload={onFileUpload}
        onSecondaryFileUpload={onCogsFileUpload}
        onPrimaryFileDelete={onPrimaryFileDelete}
        onSecondaryFileDelete={onCogsFileDelete}
        onDownloadPdf={downloadPdf}
      />
        {unitReports && isOzonUnitEconomics && (
          <Suspense fallback={null}>
            {createElement(lazyUnitEconomicsResults, {
              reports: unitReports,
            })}
          </Suspense>
        )}

        {accrualReports && !isOzonUnitEconomics && (
          <Suspense fallback={null}>
            {createElement(lazyAccrualResults, {
              reports: accrualReports,
              showAccrualOverview: true,
              cogsMissingValueText: 'Нет данных: загрузите CSV с себестоимостью товаров',
            })}
          </Suspense>
        )}
    </main>
  )
}
