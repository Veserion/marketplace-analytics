import classNames from 'classnames/bind'
import { useNavigate } from 'react-router-dom'
import { MarketplaceTabs } from '@/features/marketplace-switcher'
import { MetricsSelectorPanel } from '@/features/metrics-selector'
import { OzonCalculationTabs } from '@/features/ozon-calculation-switcher'
import { ReportUploadPanel } from '@/features/report-upload'
import { UnitExtraParamsPanel } from '@/features/unit-extra-params/ui/UnitExtraParamsPanel'
import { useOzonAnalyticsPage } from '@/pages/analytics-page/model/useAnalyticsPage'
import { Typography, UiPanel } from '@/shared/ui-kit'
import { AccrualResults, UnitEconomicsResults } from '@/widgets/report-results'
import styles from './AnalyticsPage.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AnalyticsPage'

export function AnalyticsPage() {
  const navigate = useNavigate()
  const {
    accrualReports,
    accrualArticlePattern,
    articlePattern,
    clearMetrics,
    downloadPdf,
    error,
    fileName,
    hasResults,
    isExtraParamsOpen,
    isMetricsOpen,
    isOzonUnitEconomics,
    isProcessing,
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
        <Typography variant="h1" color="light">Аналитика продаж маркетплейсов</Typography>
        <Typography variant="body1" color="light" className={cn(`${BLOCK_NAME}__subtitle`)}>
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
        vatRatePercent={vatRatePercent}
        taxRatePercent={taxRatePercent}
        onToggleOpen={() => setIsExtraParamsOpen((prev) => !prev)}
        onUnitArticlePatternChange={setArticlePattern}
        onAccrualArticlePatternChange={setAccrualArticlePattern}
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
        error={error}
        showWildberriesWarning={false}
        onFileUpload={onFileUpload}
        onDownloadPdf={downloadPdf}
      />

      {unitReports && isOzonUnitEconomics && (
        <UnitEconomicsResults
          reports={unitReports}
          selectedMetricSet={selectedMetricSet}
        />
      )}

      {accrualReports && !isOzonUnitEconomics && (
        <AccrualResults
          reports={accrualReports}
          showAccrualOverview
          cogsMissingValueText='Нет данных: загрузите "Юнит экономика" за тот же период'
        />
      )}
    </main>
  )
}
