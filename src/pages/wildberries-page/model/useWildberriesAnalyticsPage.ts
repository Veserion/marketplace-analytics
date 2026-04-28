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
import { formatValue, normalize, parseCsv } from '@/shared/lib/csv'
import { getCsvRecord, saveCsvRecord } from '@/shared/lib/indexed-db'
import { configurePdfFont, PDF_THEMES, renderPdfReport } from '@/shared/lib/pdf'
import { readUploadFileAsCsv } from '@/shared/lib/upload-file'
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
const WB_COGS_FALLBACK_NOTE = 'Используется файл себестоимостей Ozon'
const FOREIGN_REPORT_LABEL = 'Отчет по продажам в других странах'

function stripBom(value: string): string {
  return value.startsWith('\uFEFF') ? value.slice(1) : value
}

function escapeCsvCell(value: string): string {
  if (!/[;"\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell ?? '')).join(';')).join('\n')
}

function parseCsvRows(csvSource: string): string[][] {
  return parseCsv(stripBom(csvSource))
}

function mergeWildberriesReports(
  primaryCsvSource: string | null,
  foreignCsvSource: string | null,
): string | null {
  if (!primaryCsvSource && !foreignCsvSource) return null
  if (!primaryCsvSource) return foreignCsvSource
  if (!foreignCsvSource) return primaryCsvSource

  const primaryRows = parseCsvRows(primaryCsvSource)
  const foreignRows = parseCsvRows(foreignCsvSource)
  if (primaryRows.length === 0 || foreignRows.length === 0) {
    throw new Error('Не удалось объединить отчеты Wildberries: один из файлов пустой.')
  }

  const primaryHeader = primaryRows[0] ?? []
  const foreignHeader = foreignRows[0] ?? []
  const normalizedPrimaryHeader = primaryHeader.map((cell) => normalize(cell))
  const normalizedForeignHeader = foreignHeader.map((cell) => normalize(cell))
  const sameHeader = normalizedPrimaryHeader.length === normalizedForeignHeader.length
    && normalizedPrimaryHeader.every((cell, index) => cell === normalizedForeignHeader[index])
  if (!sameHeader) {
    throw new Error('Не удалось объединить отчеты Wildberries: набор колонок в файлах не совпадает.')
  }

  return rowsToCsv([primaryHeader, ...primaryRows.slice(1), ...foreignRows.slice(1)])
}

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
  const [primaryCsvSource, setPrimaryCsvSource] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [foreignCsvSource, setForeignCsvSource] = useState<string | null>(null)
  const [foreignFileName, setForeignFileName] = useState('')
  const [cogsCsvSource, setCogsCsvSource] = useState<string | null>(null)
  const [cogsFileName, setCogsFileName] = useState('')
  const [cogsFallbackNote, setCogsFallbackNote] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExtraParamsOpen, setIsExtraParamsOpen] = useState(false)
  const [articlePattern, setArticlePattern] = useState('*')
  const [isArticlePatternExclude, setIsArticlePatternExclude] = useState(false)
  const [cogsMatchingMode, setCogsMatchingMode] = useState<CogsMatchingMode>(() => readStoredCogsMatchingMode())
  const [vatRatePercent, setVatRatePercent] = useState<number>(() => readStoredRate(VAT_RATE_STORAGE_KEY, DEFAULT_VAT_RATE))
  const [taxRatePercent, setTaxRatePercent] = useState<number>(() => readStoredRate(TAX_RATE_STORAGE_KEY, DEFAULT_TAX_RATE))

  const mergedCsvBuild = useMemo(() => {
    try {
      return {
        csvSource: mergeWildberriesReports(primaryCsvSource, foreignCsvSource),
        error: '',
      }
    } catch (err) {
      return {
        csvSource: null,
        error: err instanceof Error ? err.message : 'Не удалось объединить отчеты Wildberries.',
      }
    }
  }, [primaryCsvSource, foreignCsvSource])

  const csvSource = mergedCsvBuild.csvSource

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
  const periodLabel = reports?.find((report) => report.title === 'Итоги периода')?.periodLabel ?? ''
  const uploadStatusText = useMemo(() => {
    const loadedCount = Number(Boolean(fileName)) + Number(Boolean(foreignFileName))
    if (!loadedCount || !periodLabel) return ''
    const reportLabel = loadedCount > 1 ? 'Загружены отчеты' : 'Загружен отчет'
    return `${reportLabel} ${periodLabel}`
  }, [fileName, foreignFileName, periodLabel])
  const error = uploadError || mergedCsvBuild.error || reportBuild.error
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
    setPrimaryCsvSource(null)
    setFileName(file.name)
    setIsProcessing(true)

    try {
      const text = await readUploadFileAsCsv(file)
      setPrimaryCsvSource(text)
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

  const onForeignFileUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadError('')
    setForeignFileName(file.name)
    setIsProcessing(true)

    try {
      const text = await readUploadFileAsCsv(file)
      setForeignCsvSource(text)
      try {
        await saveCsvRecord({
          mode: 'wildberriesForeignAccrualReport',
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
      const text = await readUploadFileAsCsv(file)
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
      setCogsFallbackNote('')
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
    Promise.all([
      getCsvRecord('wildberriesAccrualReport'),
      getCsvRecord('wildberriesForeignAccrualReport'),
      getCsvRecord('wildberriesCogs'),
      getCsvRecord('ozonCogs'),
    ])
      .then(([mainRecord, foreignRecord, wbCogsRecord, ozonCogsRecord]) => {
        if (isCancelled) return
        setPrimaryCsvSource(mainRecord?.csvText ?? null)
        setFileName(mainRecord?.fileName ?? '')
        setForeignCsvSource(foreignRecord?.csvText ?? null)
        setForeignFileName(foreignRecord?.fileName ?? '')
        if (wbCogsRecord?.csvText) {
          setCogsCsvSource(wbCogsRecord.csvText)
          setCogsFileName(COGS_FILE_ALIAS)
          setCogsFallbackNote('')
        } else if (ozonCogsRecord?.csvText) {
          setCogsCsvSource(ozonCogsRecord.csvText)
          setCogsFileName(COGS_FILE_ALIAS)
          setCogsFallbackNote(WB_COGS_FALLBACK_NOTE)
        } else {
          setCogsCsvSource(null)
          setCogsFileName('')
          setCogsFallbackNote('')
        }
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
    const pdfSource = [fileName, foreignFileName].filter(Boolean).join(' + ')

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
    await configurePdfFont(doc)
    renderPdfReport({
      doc,
      theme: PDF_THEMES.wildberries,
      title: 'Marketplace Analytics',
      subtitle: 'Wildberries / Отчет по поступлениям',
      source: pdfSource,
      sections: buildWildberriesPdfSections(reports),
    })
    doc.save(`wildberries-analytics-${Date.now()}.pdf`)
  }

  return {
    articlePattern,
    cogsFallbackNote,
    cogsFileName,
    cogsMatchingMode,
    downloadPdf,
    error,
    fileName,
    foreignFileName,
    foreignReportLabel: FOREIGN_REPORT_LABEL,
    uploadStatusText,
    hasResults,
    isArticlePatternExclude,
    isExtraParamsOpen,
    isProcessing,
    missingCogsArticles,
    onCogsFileUpload,
    onForeignFileUpload,
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
