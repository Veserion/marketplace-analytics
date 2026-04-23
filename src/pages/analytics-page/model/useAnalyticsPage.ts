import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { jsPDF } from 'jspdf'
import {
  buildAccrualReports,
  buildUnitArticleCogsMap,
  buildUnitEconomicsReports,
  getUnitMetricClassValue,
  getUnitMetricDisplay,
  METRICS,
} from '@/entities/ozon-report'
import type {
  AccrualGroup,
  MetricKey,
  OzonCalculationType,
  ReportGroup,
} from '@/entities/ozon-report'
import { formatValue } from '@/shared/lib/csv'
import { getCsvRecord, saveCsvRecord } from '@/shared/lib/indexed-db'
import { configurePdfFont, PDF_THEMES, renderPdfReport } from '@/shared/lib/pdf'
import type { PdfMetricTone, PdfSection } from '@/shared/lib/pdf'

const VAT_RATE_STORAGE_KEY = 'unit_economics_vat_rate_percent'
const TAX_RATE_STORAGE_KEY = 'unit_economics_tax_rate_percent'
const DEFAULT_VAT_RATE = 5
const DEFAULT_TAX_RATE = 6
const SECONDARY_INFO_LABELS = new Set([
  'Среднее начисление на строку',
  'Строк с плюсами',
  'Строк с минусами',
  'Строк с нулем',
])
const AVERAGE_LABEL = 'Среднее начисление на строку'
const CANCELLATIONS_AND_RETURNS_LABEL = 'Отмены, возвраты, не выкупы'
const TAX_LABEL = 'Налог'
const COGS_LABEL = 'Себестоимость'
const MARKETPLACE_EXPENSES_LABEL = 'Общие затраты по Маркетплейсу'
const COGS_MISSING_VALUE_TEXT = 'Нет данных: загрузите "Юнит экономика" за тот же период'
const STRUCTURE_PREFIX = 'Структура: '

function readStoredRate(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getPeriodKeyFromFileName(fileName: string): string | null {
  const normalized = fileName.trim()
  if (!normalized) return null
  const match = normalized.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}(?:\.\d{4})?)/)
  if (!match) return null
  const start = match[1]
  const endRaw = match[2]
  const year = start.split('.')[2]
  const end = /^\d{2}\.\d{2}$/.test(endRaw) ? `${endRaw}.${year}` : endRaw
  return `${start}-${end}`
}

function hasSamePeriod(unitFileName: string, accrualFileName: string): boolean {
  const unitPeriod = getPeriodKeyFromFileName(unitFileName)
  const accrualPeriod = getPeriodKeyFromFileName(accrualFileName)
  return Boolean(unitPeriod && accrualPeriod && unitPeriod === accrualPeriod)
}

function isSecondaryMetric(label: string): boolean {
  return SECONDARY_INFO_LABELS.has(label)
}

function getValueTone(value: number | null): PdfMetricTone {
  if (value === null) return 'muted'
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'default'
}

function summarizeArticles(items: string[]): string {
  if (items.length === 0) return 'Нет артикулов'
  const limit = 20
  if (items.length <= limit) return items.join(', ')
  return `${items.slice(0, limit).join(', ')}, ... (+${items.length - limit})`
}

function getProductMarginLevel(marginPercent: number): 'risk' | 'warning' | 'normal' | 'super' {
  if (marginPercent >= 50) return 'super'
  if (marginPercent >= 25) return 'normal'
  if (marginPercent >= 15) return 'warning'
  return 'risk'
}

function getOzonAccrualMetricTone(label: string, value: number | null): PdfMetricTone {
  if (label === COGS_LABEL && value === null) return 'muted'
  if (
    label === CANCELLATIONS_AND_RETURNS_LABEL
    || label === TAX_LABEL
    || label === COGS_LABEL
    || label === MARKETPLACE_EXPENSES_LABEL
  ) {
    return 'negative'
  }
  if (label === AVERAGE_LABEL) return 'muted'
  return getValueTone(value)
}

function buildUnitPdfSections(
  reports: ReportGroup[],
  selectedMetricSet: Set<MetricKey>,
): PdfSection[] {
  const sections: PdfSection[] = []

  for (const report of reports) {
    const rows: PdfSection['rows'] = report.metrics
      .filter((metric) => selectedMetricSet.has(metric.key))
      .map((metric) => {
        const display = getUnitMetricDisplay(metric, report)
        return {
          label: metric.label,
          value: display.valueText,
          extra: display.shareText,
          tone: getValueTone(getUnitMetricClassValue(metric)),
        }
      })

    sections.push({
      title: report.title,
      subtitle: `Строк товаров: ${report.rowCount}`,
      rows,
    })

    if (report.availabilityGroups) {
      sections.push({
        title: `${report.title} — Доступность товаров`,
        rows: [
          {
            label: 'Срочно поставить',
            value: String(report.availabilityGroups.urgent.length),
            extra: summarizeArticles(report.availabilityGroups.urgent),
            tone: 'negative',
          },
          {
            label: 'Поддерживайте остаток',
            value: String(report.availabilityGroups.maintain.length),
            extra: summarizeArticles(report.availabilityGroups.maintain),
            tone: 'warning',
          },
          {
            label: 'Пока хватает',
            value: String(report.availabilityGroups.enough.length),
            extra: summarizeArticles(report.availabilityGroups.enough),
            tone: 'positive',
          },
        ],
      })
    }

    if (report.productMargins && report.productMargins.length > 0) {
      const marginCounts = {
        risk: 0,
        warning: 0,
        normal: 0,
        super: 0,
      }
      for (const item of report.productMargins) {
        marginCounts[getProductMarginLevel(item.marginSharePercent)] += 1
      }

      const byMarginAsc = [...report.productMargins].sort((a, b) => a.marginSharePercent - b.marginSharePercent)
      const byMarginDesc = [...byMarginAsc].reverse()
      const riskExamples = byMarginAsc.slice(0, 5).map((item) => `${item.article} (${item.marginSharePercent.toFixed(1)}%)`).join(', ')
      const topExamples = byMarginDesc.slice(0, 5).map((item) => `${item.article} (${item.marginSharePercent.toFixed(1)}%)`).join(', ')

      sections.push({
        title: `${report.title} — Потоварная маржинальность`,
        rows: [
          { label: 'Артикулов в расчете', value: String(report.productMargins.length) },
          { label: '0-15% (риск)', value: String(marginCounts.risk), tone: 'negative' },
          { label: '15-25% (проверить)', value: String(marginCounts.warning), tone: 'warning' },
          { label: '25-50% (норма)', value: String(marginCounts.normal), tone: 'positive' },
          { label: '50%+ (прибыльные)', value: String(marginCounts.super), tone: 'positive' },
          { label: 'Примеры с минимальной маржой', value: riskExamples || '—', labelMuted: true },
          { label: 'Примеры с максимальной маржой', value: topExamples || '—', labelMuted: true },
        ],
      })
    }
  }

  return sections
}

function buildOzonAccrualPdfSections(reports: AccrualGroup[]): PdfSection[] {
  const sections: PdfSection[] = []
  const baseReports = reports.filter((report) => !report.title.startsWith(STRUCTURE_PREFIX))
  const structureReports = reports.filter((report) => report.title.startsWith(STRUCTURE_PREFIX))

  for (const report of baseReports) {
    const reportTitle = report.title === 'Итоги периода' && report.periodLabel
      ? `${report.title} ${report.periodLabel}`
      : report.title
    const primaryMetrics = report.metrics.filter((metric) => !isSecondaryMetric(metric.label))
    const secondaryMetrics = report.metrics.filter((metric) => isSecondaryMetric(metric.label))

    const rows: PdfSection['rows'] = primaryMetrics.map((metric) => ({
      label: metric.label,
      value: metric.label === COGS_LABEL && metric.value === null
        ? COGS_MISSING_VALUE_TEXT
        : formatValue(metric.value, metric.type),
      extra: metric.shareText ?? null,
      tone: getOzonAccrualMetricTone(metric.label, metric.value),
    }))

    if (secondaryMetrics.length > 0) {
      rows.push(...secondaryMetrics.map((metric) => ({
        label: `Доп. ${metric.label}`,
        value: formatValue(metric.value, metric.type),
        tone: 'muted' as const,
        labelMuted: true,
      })))
    }

    sections.push({
      title: reportTitle,
      subtitle: typeof report.rowCount === 'number' ? `Строк начислений: ${report.rowCount}` : undefined,
      rows,
    })
  }

  for (const report of structureReports) {
    const cleanTitle = report.title.startsWith(STRUCTURE_PREFIX) ? report.title.slice(STRUCTURE_PREFIX.length) : report.title
    sections.push({
      title: `Структура: ${cleanTitle}`,
      rows: report.metrics.map((metric) => ({
        label: metric.label,
        value: formatValue(metric.value, metric.type),
        extra: metric.shareText ?? null,
        tone: getValueTone(metric.value),
      })),
    })
  }

  return sections
}

export function useOzonAnalyticsPage() {
  const [ozonCalculationType, setOzonCalculationType] = useState<OzonCalculationType>('unitEconomics')
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(METRICS.map((metric) => metric.key))
  const [accrualCsvSource, setAccrualCsvSource] = useState<string | null>(null)
  const [accrualFileName, setAccrualFileName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [fileName, setFileName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExtraParamsOpen, setIsExtraParamsOpen] = useState(false)
  const [isMetricsOpen, setIsMetricsOpen] = useState(false)
  const [articlePattern, setArticlePattern] = useState('')
  const [accrualArticlePattern, setAccrualArticlePattern] = useState('*')
  const [unitCsvSource, setUnitCsvSource] = useState<string | null>(null)
  const [unitFileName, setUnitFileName] = useState('')
  const [vatRatePercent, setVatRatePercent] = useState<number>(() => readStoredRate(VAT_RATE_STORAGE_KEY, DEFAULT_VAT_RATE))
  const [taxRatePercent, setTaxRatePercent] = useState<number>(() => readStoredRate(TAX_RATE_STORAGE_KEY, DEFAULT_TAX_RATE))

  const isOzonUnitEconomics = ozonCalculationType === 'unitEconomics'
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
  const accrualReportBuild = useMemo(() => {
    if (!accrualCsvSource) return { reports: null as AccrualGroup[] | null, error: '' }
    try {
      const samePeriod = hasSamePeriod(unitFileName, accrualFileName)
      const unitArticleCogsMap = samePeriod && unitCsvSource ? buildUnitArticleCogsMap(unitCsvSource) : null
      return {
        reports: buildAccrualReports(accrualCsvSource, vatRatePercent, taxRatePercent, unitArticleCogsMap, accrualArticlePattern),
        error: '',
      }
    } catch (err) {
      return {
        reports: null,
        error: err instanceof Error ? err.message : 'Не удалось построить отчёт по начислениям.',
      }
    }
  }, [accrualArticlePattern, accrualCsvSource, accrualFileName, taxRatePercent, unitCsvSource, unitFileName, vatRatePercent])
  const accrualReports = accrualReportBuild.reports
  const modeError = isOzonUnitEconomics ? unitReportBuild.error : accrualReportBuild.error
  const error = uploadError || modeError
  const hasResults = isOzonUnitEconomics ? Boolean(unitReports) : Boolean(accrualReports)

  const onSwitchOzonCalculation = (calcType: OzonCalculationType): void => {
    setOzonCalculationType(calcType)
    setUploadError('')
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

    setUploadError('')
    if (ozonCalculationType === 'unitEconomics') {
      setUnitCsvSource(null)
    } else {
      setAccrualCsvSource(null)
    }
    setFileName(file.name)
    setIsProcessing(true)

    try {
      const text = await file.text()
      if (ozonCalculationType === 'accrualReport') {
        setAccrualCsvSource(text)
        setAccrualFileName(file.name)
      } else {
        setUnitCsvSource(text)
        setUnitFileName(file.name)
      }

      try {
        await saveCsvRecord({
          mode: ozonCalculationType,
          csvText: text,
          fileName: file.name,
          updatedAt: Date.now(),
        })
      } catch {
        // Ignore persistence errors to keep file upload flow functional.
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

  useEffect(() => {
    let isCancelled = false
    Promise.all([getCsvRecord('unitEconomics'), getCsvRecord('accrualReport')])
      .then(([unitRecord, accrualRecord]) => {
        if (isCancelled) return

        setUnitCsvSource(unitRecord?.csvText ?? null)
        setAccrualCsvSource(accrualRecord?.csvText ?? null)
        setUnitFileName(unitRecord?.fileName ?? '')
        setAccrualFileName(accrualRecord?.fileName ?? '')
        if (ozonCalculationType === 'unitEconomics') {
          setFileName(unitRecord?.fileName ?? '')
        } else {
          setFileName(accrualRecord?.fileName ?? '')
        }
      })
      .catch(() => {
        // Ignore persistence errors to keep CSV processing functional without IndexedDB.
      })
    return () => {
      isCancelled = true
    }
  }, [ozonCalculationType])

  const downloadPdf = async (): Promise<void> => {
    if (isOzonUnitEconomics && !unitReports) return
    if (!isOzonUnitEconomics && !accrualReports) return

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
    await configurePdfFont(doc)
    const sections = isOzonUnitEconomics && unitReports
      ? buildUnitPdfSections(unitReports, selectedMetricSet)
      : buildOzonAccrualPdfSections(accrualReports || [])

    renderPdfReport({
      doc,
      theme: isOzonUnitEconomics ? PDF_THEMES.ozonUnit : PDF_THEMES.ozonAccrual,
      title: 'Marketplace Analytics',
      subtitle: `Ozon / ${isOzonUnitEconomics ? 'Юнит экономика' : 'Отчет по поступлениям'}`,
      source: fileName,
      sections,
    })

    doc.save(`ozon-analytics-${Date.now()}.pdf`)
  }

  return {
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
  }
}
