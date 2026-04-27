import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { jsPDF } from 'jspdf'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import {
  buildWildberriesAccrualReports,
  buildWildberriesCogsMap,
  buildWildberriesTopProducts,
  type CogsMatchingMode,
  extractWildberriesCogsCsv,
  getWildberriesMissingCogsArticles,
  type WildberriesTopProductItem,
} from '@/entities/wildberries-report'
import { formatValue } from '@/shared/lib/csv'
import { getCsvRecord, saveCsvRecord } from '@/shared/lib/indexed-db'
import { configurePdfFont, PDF_THEMES, renderPdfReport } from '@/shared/lib/pdf'
import type { PdfMetricTone, PdfSection } from '@/shared/lib/pdf'

const VAT_RATE_STORAGE_KEY = 'wildberries_accrual_vat_rate_percent'
const TAX_RATE_STORAGE_KEY = 'wildberries_accrual_tax_rate_percent'
const COGS_MATCHING_MODE_STORAGE_KEY = 'wildberries_cogs_matching_mode'
const DEFAULT_VAT_RATE = 5
const DEFAULT_TAX_RATE = 6
const CANCELLATIONS_AND_RETURNS_LABEL = 'Отмены, возвраты, не выкупы'
const TAX_LABEL = 'Налог'
const COGS_LABEL = 'Себестоимость'
const MARKETPLACE_EXPENSES_LABEL = 'Общие затраты по Маркетплейсу'
const STRUCTURE_PREFIX = 'Структура: '
const COGS_MISSING_VALUE_TEXT = 'Нет данных: загрузите CSV с себестоимостью товаров'
const COGS_FILE_ALIAS = 'Себестоимость'

function readStoredRate(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readStoredCogsMatchingMode(): CogsMatchingMode {
  if (typeof window === 'undefined') return 'full'
  const raw = window.localStorage.getItem(COGS_MATCHING_MODE_STORAGE_KEY)
  return raw === 'digits' ? 'digits' : 'full'
}

function getValueTone(value: number | null): PdfMetricTone {
  if (value === null) return 'muted'
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'default'
}

function getWbMetricTone(label: string, value: number | null): PdfMetricTone {
  if (label === COGS_LABEL && value === null) return 'muted'
  if (
    label === CANCELLATIONS_AND_RETURNS_LABEL
    || label === TAX_LABEL
    || label === COGS_LABEL
    || label === MARKETPLACE_EXPENSES_LABEL
  ) {
    return 'negative'
  }
  return getValueTone(value)
}

function buildWildberriesPdfSections(reports: AccrualGroup[]): PdfSection[] {
  const sections: PdfSection[] = []
  const baseReports = reports.filter((report) => !report.title.startsWith(STRUCTURE_PREFIX))
  const structureReports = reports.filter((report) => report.title.startsWith(STRUCTURE_PREFIX))

  for (const report of baseReports) {
    const reportTitle = report.title === 'Итоги периода' && report.periodLabel
      ? `${report.title} ${report.periodLabel}`
      : report.title
    const rows: PdfSection['rows'] = report.metrics.map((metric) => ({
      label: metric.label,
      value: metric.label === COGS_LABEL && metric.value === null
        ? COGS_MISSING_VALUE_TEXT
        : formatValue(metric.value, metric.type),
      extra: metric.shareText ?? null,
      tone: getWbMetricTone(metric.label, metric.value),
    }))

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

export function useWildberriesAnalyticsPage() {
  const [csvSource, setCsvSource] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [cogsCsvSource, setCogsCsvSource] = useState<string | null>(null)
  const [cogsFileName, setCogsFileName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExtraParamsOpen, setIsExtraParamsOpen] = useState(false)
  const [articlePattern, setArticlePattern] = useState('*')
  const [isArticlePatternExclude, setIsArticlePatternExclude] = useState(false)
  const [cogsMatchingMode, setCogsMatchingMode] = useState<CogsMatchingMode>(() => readStoredCogsMatchingMode())
  const [vatRatePercent, setVatRatePercent] = useState<number>(() => readStoredRate(VAT_RATE_STORAGE_KEY, DEFAULT_VAT_RATE))
  const [taxRatePercent, setTaxRatePercent] = useState<number>(() => readStoredRate(TAX_RATE_STORAGE_KEY, DEFAULT_TAX_RATE))

  const cogsByArticleMap = useMemo(() => {
    if (!cogsCsvSource) return null
    return buildWildberriesCogsMap(cogsCsvSource, cogsMatchingMode)
  }, [cogsCsvSource, cogsMatchingMode])

  const missingCogsArticles = useMemo(() => {
    if (!csvSource) return [] as string[]
    return getWildberriesMissingCogsArticles(
      csvSource,
      cogsByArticleMap,
      articlePattern,
      cogsMatchingMode,
      isArticlePatternExclude,
    )
  }, [articlePattern, cogsByArticleMap, cogsMatchingMode, csvSource, isArticlePatternExclude])

  const topProducts = useMemo(() => {
    if (!csvSource) return [] as WildberriesTopProductItem[]
    try {
      return buildWildberriesTopProducts(
        csvSource,
        articlePattern,
        cogsByArticleMap,
        cogsMatchingMode,
        isArticlePatternExclude,
      )
    } catch {
      return [] as WildberriesTopProductItem[]
    }
  }, [articlePattern, cogsByArticleMap, cogsMatchingMode, csvSource, isArticlePatternExclude])

  const reportBuild = useMemo(() => {
    if (!csvSource) return { reports: null as AccrualGroup[] | null, error: '' }
    try {
      return {
        reports: buildWildberriesAccrualReports(
          csvSource,
          vatRatePercent,
          taxRatePercent,
          articlePattern,
          cogsByArticleMap,
          cogsMatchingMode,
          isArticlePatternExclude,
        ),
        error: '',
      }
    } catch (err) {
      return {
        reports: null,
        error: err instanceof Error ? err.message : 'Не удалось построить отчёт Wildberries.',
      }
    }
  }, [articlePattern, cogsByArticleMap, cogsMatchingMode, csvSource, taxRatePercent, vatRatePercent, isArticlePatternExclude])

  const reports = reportBuild.reports
  const error = uploadError || reportBuild.error
  const hasResults = Boolean(reports)

  const onVatRateChange = (value: number): void => {
    setVatRatePercent(Number.isFinite(value) ? value : 0)
  }

  const onTaxRateChange = (value: number): void => {
    setTaxRatePercent(Number.isFinite(value) ? value : 0)
  }

  const onFileUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError('')
    setCsvSource(null)
    setFileName(file.name)
    setIsProcessing(true)

    try {
      const text = await file.text()
      setCsvSource(text)
      try {
        await saveCsvRecord({
          mode: 'wildberriesAccrualReport',
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

  const onCogsFileUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError('')
    setIsProcessing(true)

    try {
      const text = await file.text()
      const compactCsv = extractWildberriesCogsCsv(text)
      if (!compactCsv) {
        setUploadError('Некорректный CSV себестоимости: обязательны колонки "Артикул" и "Себестоимость" (регистр не важен).')
        return
      }
      const parsedMap = buildWildberriesCogsMap(compactCsv, cogsMatchingMode)
      if (!parsedMap) {
        setUploadError('Некорректный CSV себестоимости: обязательны колонки "Артикул" и "Себестоимость" (регистр не важен).')
        return
      }

      setCogsCsvSource(compactCsv)
      setCogsFileName(COGS_FILE_ALIAS)
      try {
        await saveCsvRecord({
          mode: 'wildberriesCogs',
          csvText: compactCsv,
          fileName: COGS_FILE_ALIAS,
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
    let isCancelled = false
    Promise.all([getCsvRecord('wildberriesAccrualReport'), getCsvRecord('wildberriesCogs')])
      .then(([mainRecord, cogsRecord]) => {
        if (isCancelled) return
        setCsvSource(mainRecord?.csvText ?? null)
        setFileName(mainRecord?.fileName ?? '')
        setCogsCsvSource(cogsRecord?.csvText ?? null)
        setCogsFileName(cogsRecord?.csvText ? COGS_FILE_ALIAS : '')
      })
      .catch(() => {
        // Ignore persistence errors to keep CSV processing functional without IndexedDB.
      })
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VAT_RATE_STORAGE_KEY, String(vatRatePercent))
  }, [vatRatePercent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TAX_RATE_STORAGE_KEY, String(taxRatePercent))
  }, [taxRatePercent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COGS_MATCHING_MODE_STORAGE_KEY, cogsMatchingMode)
  }, [cogsMatchingMode])

  const downloadPdf = async (): Promise<void> => {
    if (!reports) return

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
    await configurePdfFont(doc)
    renderPdfReport({
      doc,
      theme: PDF_THEMES.wildberries,
      title: 'Marketplace Analytics',
      subtitle: 'Wildberries / Отчет по поступлениям',
      source: fileName,
      sections: buildWildberriesPdfSections(reports),
    })
    doc.save(`wildberries-analytics-${Date.now()}.pdf`)
  }

  return {
    articlePattern,
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
  }
}
