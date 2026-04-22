import classNames from 'classnames/bind'
import { useNavigate } from 'react-router-dom'
import { MarketplaceTabs } from '@/features/marketplace-switcher'
import { ReportUploadPanel } from '@/features/report-upload'
import { UnitExtraParamsPanel } from '@/features/unit-extra-params'
import { useWildberriesAnalyticsPage } from '@/pages/wildberries-page/model/useWildberriesAnalyticsPage'
import { Typography, UiPanel, UiTabs } from '@/shared/ui-kit'
import { AccrualResults } from '@/widgets/report-results'
import styles from './WildberriesPage.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'WildberriesPage'
const WB_CALCULATION_ITEMS = [{ key: 'accrualReport', label: 'Отчет по поступлениям' }] as const

export function WildberriesPage() {
  const navigate = useNavigate()
  const {
    articlePattern,
    downloadPdf,
    error,
    fileName,
    hasResults,
    isExtraParamsOpen,
    isProcessing,
    onFileUpload,
    onTaxRateChange,
    onVatRateChange,
    reports,
    setArticlePattern,
    setIsExtraParamsOpen,
    taxRatePercent,
    vatRatePercent,
  } = useWildberriesAnalyticsPage()

  const onSwitchMarketplace = (marketplace: 'wildberries' | 'ozon'): void => {
    navigate(marketplace === 'wildberries' ? '/wildberries' : '/ozon')
  }

  return (
    <main className={cn(BLOCK_NAME)}>
      <header className={cn(`${BLOCK_NAME}__hero`)}>
        <Typography variant="caption" color="light" className={cn(`${BLOCK_NAME}__eyebrow`)}>
          Marketplace Analytics
        </Typography>
        <Typography variant="h1" color="light">Аналитика Wildberries</Typography>
        <Typography variant="body1" color="light" className={cn(`${BLOCK_NAME}__subtitle`)}>
          Загрузите еженедельный детализированный отчет Wildberries для расчета поступлений и структуры начислений.
        </Typography>
      </header>

      <MarketplaceTabs activeMarketplace="wildberries" onChange={onSwitchMarketplace} />

      <UiPanel title="Вариант расчёта">
        <UiTabs
          items={WB_CALCULATION_ITEMS.map((item) => ({ key: item.key, label: item.label }))}
          value="accrualReport"
          onChange={() => undefined}
          ariaLabel="Вариант расчёта для Wildberries"
        />
      </UiPanel>

      <UnitExtraParamsPanel
        isOpen={isExtraParamsOpen}
        isAccrualMode
        accrualArticlePattern={articlePattern}
        vatRatePercent={vatRatePercent}
        taxRatePercent={taxRatePercent}
        onToggleOpen={() => setIsExtraParamsOpen((prev) => !prev)}
        onAccrualArticlePatternChange={setArticlePattern}
        onVatRateChange={onVatRateChange}
        onTaxRateChange={onTaxRateChange}
      />

      <ReportUploadPanel
        isProcessing={isProcessing}
        hasResults={hasResults}
        fileName={fileName}
        error={error}
        showWildberriesWarning={false}
        onFileUpload={onFileUpload}
        onDownloadPdf={downloadPdf}
      />

      {reports && <AccrualResults reports={reports} />}
    </main>
  )
}
