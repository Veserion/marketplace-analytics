import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { jsPDF } from 'jspdf'
import {
  buildAccrualReports,
  buildUnitEconomicsReports,
  getUnitMetricDisplayValue,
  METRICS,
} from '@/entities/ozon-report'
import type {
  AccrualGroup,
  Marketplace,
  MetricKey,
  OzonCalculationType,
  ReportGroup,
} from '@/entities/ozon-report'
import { formatValue } from '@/shared/lib/csv'
import { configurePdfFont } from '@/shared/lib/pdf'

const VAT_RATE_STORAGE_KEY = 'unit_economics_vat_rate_percent'
const TAX_RATE_STORAGE_KEY = 'unit_economics_tax_rate_percent'
const DEFAULT_VAT_RATE = 5
const DEFAULT_TAX_RATE = 6

function readStoredRate(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function renderUnitEconomicsPdf(
  doc: jsPDF,
  reports: ReportGroup[],
  selectedMetricSet: Set<MetricKey>,
  margin: number,
  contentWidth: number,
  startY: number,
  ensureSpace: (height: number) => void,
): void {
  let y = startY
  for (const report of reports) {
    ensureSpace(16)
    doc.setFillColor(33, 85, 140)
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.text(report.title, margin + 4, y + 7)
    doc.setFontSize(9)
    doc.text(`Строк товаров: ${report.rowCount}`, margin + 4, y + 10.5)
    y += 15

    const selectedMetrics = report.metrics.filter((metric) => selectedMetricSet.has(metric.key))
    for (const metric of selectedMetrics) {
      const line = `${metric.label}: ${getUnitMetricDisplayValue(metric, report)}`
      const lines = doc.splitTextToSize(line, contentWidth - 6)
      const rowHeight = Math.max(10, lines.length * 4 + 4)
      ensureSpace(rowHeight + 2)

      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(219, 226, 237)
      doc.roundedRect(margin, y, contentWidth, rowHeight, 1.5, 1.5, 'FD')
      doc.setTextColor(20, 31, 48)
      doc.setFontSize(9)
      doc.text(lines, margin + 3, y + 5)
      y += rowHeight + 2
    }

    y += 4
  }
}

function renderAccrualPdf(
  doc: jsPDF,
  reports: AccrualGroup[],
  margin: number,
  contentWidth: number,
  startY: number,
  ensureSpace: (height: number) => void,
): void {
  let y = startY
  for (const report of reports) {
    ensureSpace(16)
    doc.setFillColor(33, 85, 140)
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.text(report.title, margin + 4, y + 7)
    doc.setFontSize(9)
    if (typeof report.rowCount === 'number') {
      doc.text(`Строк начислений: ${report.rowCount}`, margin + 4, y + 10.5)
    }
    y += 15

    for (const metric of report.metrics) {
      const line = `${metric.label}: ${formatValue(metric.value, metric.type)}`
      const lines = doc.splitTextToSize(line, contentWidth - 6)
      const rowHeight = Math.max(10, lines.length * 4 + 4)
      ensureSpace(rowHeight + 2)

      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(219, 226, 237)
      doc.roundedRect(margin, y, contentWidth, rowHeight, 1.5, 1.5, 'FD')
      doc.setTextColor(20, 31, 48)
      doc.setFontSize(9)
      doc.text(lines, margin + 3, y + 5)
      y += rowHeight + 2
    }

    y += 4
  }
}

export function useAnalyticsPage() {
  const [activeMarketplace, setActiveMarketplace] = useState<Marketplace>('ozon')
  const [ozonCalculationType, setOzonCalculationType] = useState<OzonCalculationType>('unitEconomics')
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(METRICS.map((metric) => metric.key))
  const [accrualReports, setAccrualReports] = useState<AccrualGroup[] | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [fileName, setFileName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExtraParamsOpen, setIsExtraParamsOpen] = useState(false)
  const [isMetricsOpen, setIsMetricsOpen] = useState(false)
  const [articlePattern, setArticlePattern] = useState('st*')
  const [unitCsvSource, setUnitCsvSource] = useState<string | null>(null)
  const [vatRatePercent, setVatRatePercent] = useState<number>(() => readStoredRate(VAT_RATE_STORAGE_KEY, DEFAULT_VAT_RATE))
  const [taxRatePercent, setTaxRatePercent] = useState<number>(() => readStoredRate(TAX_RATE_STORAGE_KEY, DEFAULT_TAX_RATE))

  const isOzonUnitEconomics = activeMarketplace === 'ozon' && ozonCalculationType === 'unitEconomics'
  const selectedMetricSet = useMemo(() => new Set<MetricKey>(selectedMetrics), [selectedMetrics])
  const unitReportBuild = useMemo(() => {
    if (!isOzonUnitEconomics || !unitCsvSource) return { reports: null as ReportGroup[] | null, error: '' }
    try {
      return {
        reports: buildUnitEconomicsReports(unitCsvSource, articlePattern, vatRatePercent, taxRatePercent),
        error: '',
      }
    } catch (err) {
      return {
        reports: null,
        error: err instanceof Error ? err.message : 'Не удалось применить фильтр по артикулу.',
      }
    }
  }, [articlePattern, isOzonUnitEconomics, taxRatePercent, unitCsvSource, vatRatePercent])
  const unitReports = unitReportBuild.reports
  const error = uploadError || unitReportBuild.error
  const hasResults = isOzonUnitEconomics ? Boolean(unitReports) : Boolean(accrualReports)

  const resetResults = (): void => {
    setAccrualReports(null)
    setUnitCsvSource(null)
    setUploadError('')
  }

  const onSwitchMarketplace = (marketplace: Marketplace): void => {
    setActiveMarketplace(marketplace)
    resetResults()
  }

  const onSwitchOzonCalculation = (calcType: OzonCalculationType): void => {
    setOzonCalculationType(calcType)
    resetResults()
  }

  const onVatRateChange = (value: number): void => {
    setVatRatePercent(Number.isFinite(value) ? value : 0)
  }

  const onTaxRateChange = (value: number): void => {
    setTaxRatePercent(Number.isFinite(value) ? value : 0)
  }

  const toggleMetric = (key: MetricKey): void => {
    setSelectedMetrics((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  const selectAllMetrics = (): void => setSelectedMetrics(METRICS.map((metric) => metric.key))
  const clearMetrics = (): void => setSelectedMetrics([])

  const onFileUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return

    resetResults()
    setFileName(file.name)
    setIsProcessing(true)

    try {
      const text = await file.text()
      if (activeMarketplace === 'wildberries') {
        throw new Error('Расчёт для Wildberries пока не реализован.')
      }

      if (ozonCalculationType === 'accrualReport') {
        setUnitCsvSource(null)
        setAccrualReports(buildAccrualReports(text))
      } else {
        setUnitCsvSource(text)
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Не удалось обработать файл.')
    } finally {
      setIsProcessing(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VAT_RATE_STORAGE_KEY, String(vatRatePercent))
  }, [vatRatePercent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TAX_RATE_STORAGE_KEY, String(taxRatePercent))
  }, [taxRatePercent])

  const downloadPdf = async (): Promise<void> => {
    if (isOzonUnitEconomics && !unitReports) return
    if (!isOzonUnitEconomics && !accrualReports) return

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
    await configurePdfFont(doc)

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 12
    const contentWidth = pageWidth - margin * 2
    let y = margin

    const ensureSpace = (height: number): void => {
      if (y + height <= pageHeight - margin) return
      doc.addPage()
      doc.setFont('ArialCustom')
      y = margin
    }

    doc.setFillColor(10, 30, 60)
    doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(15)
    doc.text(`Marketplace Analytics — Ozon / ${isOzonUnitEconomics ? 'Юнит экономика' : 'Отчет по начислениям'}`, margin + 4, y + 8)
    doc.setFontSize(9)
    doc.text(`Источник: ${fileName}`, margin + 4, y + 14)
    y += 26

    if (isOzonUnitEconomics && unitReports) {
      renderUnitEconomicsPdf(doc, unitReports, selectedMetricSet, margin, contentWidth, y, ensureSpace)
    }
    if (!isOzonUnitEconomics && accrualReports) {
      renderAccrualPdf(doc, accrualReports, margin, contentWidth, y, ensureSpace)
    }

    doc.save(`ozon-analytics-${Date.now()}.pdf`)
  }

  return {
    accrualReports,
    activeMarketplace,
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
    onSwitchMarketplace,
    onSwitchOzonCalculation,
    onTaxRateChange,
    onVatRateChange,
    ozonCalculationType,
    selectAllMetrics,
    selectedMetricSet,
    setArticlePattern,
    setIsExtraParamsOpen,
    setIsMetricsOpen,
    showWildberriesWarning: activeMarketplace === 'wildberries',
    taxRatePercent,
    toggleMetric,
    unitReports,
    vatRatePercent,
  }
}
