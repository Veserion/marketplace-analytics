import classNames from 'classnames/bind'
import { createElement, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { MarketplaceTabs } from '@/features/marketplace-switcher'
import { ReportUploadPanel } from '@/features/report-upload'
import { UnitExtraParamsPanel } from '@/features/unit-extra-params'
import { useWildberriesAnalyticsPage } from '@/pages/wildberries-page/model/useWildberriesAnalyticsPage'
import { UiPanel } from '@/shared/ui-kit/panel'
import { UiTabs } from '@/shared/ui-kit/tabs'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'WildberriesPage'
const WB_CALCULATION_ITEMS = [{ key: 'accrualReport', label: 'Отчет по поступлениям' }] as const
const lazyAccrualResults = lazy(async () => import('@/widgets/report-results/ui/AccrualResults').then((module) => ({ default: module.AccrualResults })))
const lazyWildberriesTopProductsPanel = lazy(async () => import('@/widgets/report-results/ui/WildberriesTopProductsPanel').then((module) => ({ default: module.WildberriesTopProductsPanel })))

export function WildberriesPage() {
  const navigate = useNavigate()
  const {
    articlePattern,
    cogsFallbackNote,
    cogsFileName,
    cogsMatchingMode,
    downloadPdf,
    error,
    fileName,
    hasResults,
    isArticlePatternExclude,
    isExtraParamsOpen,
    isProcessing,
    missingCogsArticles,
    onCogsFileUpload,
    onFileUpload,
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
        secondaryFileName={cogsFileName}
        secondaryFileLabel="Себестоимость товаров"
        secondaryFileHint='Для формирования более полного отчета желательно добавить файл себестоимости. Обязательные колонки: "Артикул" и "Себестоимость" (регистр не важен).'
        secondaryUsageNote={cogsFallbackNote}
        secondaryMissingArticles={missingCogsArticles}
        secondaryAlertText="Таблица себестоимости неполная: отсутствуют артикулы из основного отчета. Расчет будет неполным."
        error={error}
        showWildberriesWarning={false}
        onFileUpload={onFileUpload}
        onSecondaryFileUpload={onCogsFileUpload}
        onDownloadPdf={downloadPdf}
      />

      {reports && (
        <Suspense fallback={null}>
          {createElement(lazyAccrualResults, {
            reports,
            showAccrualOverview: true,
            cogsMissingValueText: 'Нет данных: загрузите CSV с себестоимостью товаров',
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
