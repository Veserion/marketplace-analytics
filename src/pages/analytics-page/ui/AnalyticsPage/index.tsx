import classNames from 'classnames/bind'
import { createElement, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { MarketplaceTabs } from '@/features/marketplace-switcher'
import { MetricsSelectorPanel } from '@/features/metrics-selector'
import { OzonCalculationTabs } from '@/features/ozon-calculation-switcher'
import { ReportUploadPanel } from '@/features/report-upload'
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
  const navigate = useNavigate()
  const {
    accrualReports,
    accrualArticlePattern,
    articlePattern,
    cogsFallbackNote,
    cogsFileName,
    clearMetrics,
    downloadPdf,
    error,
    fileName,
    hasResults,
    isAccrualArticlePatternExclude,
    isExtraParamsOpen,
    isMetricsOpen,
    isOzonUnitEconomics,
    isProcessing,
    isUnitArticlePatternExclude,
    onCogsFileUpload,
    onFileUpload,
    onSwitchOzonCalculation,
    onTaxRateChange,
    onVatRateChange,
    ozonCalculationType,
    selectAllMetrics,
    selectedMetricSet,
    setArticlePattern,
    setAccrualArticlePattern,
    setIsExtraParamsOpen,
    setIsMetricsOpen,
    setIsAccrualArticlePatternExclude,
    setIsUnitArticlePatternExclude,
    taxRatePercent,
    toggleMetric,
    unitReports,
    vatRatePercent,
  } = useOzonAnalyticsPage()

  const onSwitchMarketplace = (marketplace: 'wildberries' | 'ozon'): void => {
    navigate(marketplace === 'wildberries' ? '/wildberries' : '/ozon')
  }

  return (
    <main className={cn(BLOCK_NAME)}>
      <header className={cn(`${BLOCK_NAME}__hero`)}>
        <Typography variant="caption" color="light" className={cn(`${BLOCK_NAME}__eyebrow`)}>
          Marketplace Analytics
        </Typography>
        <Typography as="h1" variant="h1" color="light" className={cn(`${BLOCK_NAME}__title`)}>
          Аналитика продаж маркетплейсов
        </Typography>
        <Typography as="p" variant="body1" color="light" className={cn(`${BLOCK_NAME}__subtitle`)}>
          Выберите площадку, метрики и загрузите CSV. Расчёт и отчёт в PDF формируются на лету.
        </Typography>
      </header>

      <MarketplaceTabs activeMarketplace="ozon" onChange={onSwitchMarketplace} />

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
        vatRatePercent={vatRatePercent}
        taxRatePercent={taxRatePercent}
        onToggleOpen={() => setIsExtraParamsOpen((prev) => !prev)}
        onUnitArticlePatternChange={setArticlePattern}
        onAccrualArticlePatternChange={setAccrualArticlePattern}
        onUnitArticlePatternExcludeChange={setIsUnitArticlePatternExclude}
        onAccrualArticlePatternExcludeChange={setIsAccrualArticlePatternExclude}
        onVatRateChange={onVatRateChange}
        onTaxRateChange={onTaxRateChange}
      />

      {isOzonUnitEconomics && (
        <MetricsSelectorPanel
          isOpen={isMetricsOpen}
          selectedMetricSet={selectedMetricSet}
          onToggleOpen={() => setIsMetricsOpen((prev) => !prev)}
          onToggleMetric={toggleMetric}
          onSelectAll={selectAllMetrics}
          onClearAll={clearMetrics}
        />
      )}

      <ReportUploadPanel
        isProcessing={isProcessing}
        hasResults={hasResults}
        fileName={fileName}
        secondaryFileName={cogsFileName}
        secondaryFileLabel="Себестоимость товаров"
        secondaryFileHint='Для формирования более полного отчета желательно добавить файл себестоимости. Обязательные колонки: "Артикул" и "Себестоимость".'
        secondaryUsageNote={cogsFallbackNote}
        error={error}
        showWildberriesWarning={false}
        onFileUpload={onFileUpload}
        onSecondaryFileUpload={onCogsFileUpload}
        onDownloadPdf={downloadPdf}
      />

      {unitReports && isOzonUnitEconomics && (
        <Suspense fallback={null}>
          {createElement(lazyUnitEconomicsResults, {
            reports: unitReports,
            selectedMetricSet,
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
