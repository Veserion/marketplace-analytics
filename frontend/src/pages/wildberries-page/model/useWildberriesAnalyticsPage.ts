import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { jsPDF } from 'jspdf'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import {
  buildWildberriesAccrualReports,
  buildWildberriesCogsMap,
  buildWildberriesTopProducts,
  type CogsMatchingMode,
  extractWildberriesCogsCsv,
  extractWildberriesPeriodFromCsv,
  getWildberriesMissingCogsArticles,
  MAX_WEEKLY_REPORTS,
  type WbUploadedReport,
  WB_WEEKLY_SLOTS,
  type WbWeeklySlot,
  type WildberriesTopProductItem,
  validateWildberriesWeeklyColumns,
} from '@/entities/wildberries-report'
import { formatValue, normalize, parseCsv } from '@/shared/lib/csv'
import type { CsvStorageMode } from '@/shared/lib/indexed-db'
import { deleteCsvRecord, getCsvRecord, saveCsvRecord } from '@/shared/lib/indexed-db'
import { configurePdfFont, PDF_THEMES, renderPdfReport } from '@/shared/lib/pdf'
import { readUploadFileAsCsv } from '@/shared/lib/upload-file'
import type { PdfMetricTone, PdfSection } from '@/shared/lib/pdf'

const VAT_RATE_STORAGE_KEY = 'wildberries_accrual_vat_rate_percent'
const TAX_RATE_STORAGE_KEY = 'wildberries_accrual_tax_rate_percent'
const COGS_MATCHING_MODE_STORAGE_KEY = 'wildberries_cogs_matching_mode'
const DEFAULT_VAT_RATE = 5
const DEFAULT_TAX_RATE = 6
const CANCELLATIONS_AND_RETURNS_LABEL = 'Отмены, возвраты, не выкупы'
const CANCELLATIONS_AND_NON_PICKUPS_LABEL = 'Отмены и не выкупы'
const RETURNS_QUANTITY_LABEL = 'Возвраты'
const TAX_LABEL = 'Налог'
const COGS_LABEL = 'Себестоимость'
const MARKETPLACE_EXPENSES_LABEL = 'Общие затраты по Маркетплейсу'
const STRUCTURE_PREFIX = 'Структура: '
const COGS_MISSING_VALUE_TEXT = 'Нет данных: загрузите CSV с себестоимостью товаров'
const COGS_FILE_ALIAS = 'Себестоимость'
const WB_COGS_FALLBACK_NOTE = 'Используется файл себестоимостей Ozon'

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

function mergeWeeklyCsvs(csvTexts: string[]): string | null {
  if (csvTexts.length === 0) return null
  if (csvTexts.length === 1) return csvTexts[0]

  const allRowSets = csvTexts.map(parseCsvRows)
  const [firstRows, ...rest] = allRowSets
  if (!firstRows || firstRows.length === 0) return null

  const header = firstRows[0]
  const normalizedHeader = header.map((cell) => normalize(cell))

  const combinedDataRows = [...firstRows.slice(1)]

  for (const rows of rest) {
    if (rows.length === 0) continue
    const thisHeader = rows[0].map((cell) => normalize(cell))
    const sameHeader = normalizedHeader.length === thisHeader.length
      && normalizedHeader.every((cell, index) => cell === thisHeader[index])
    if (!sameHeader) continue
    combinedDataRows.push(...rows.slice(1))
  }

  return rowsToCsv([header, ...combinedDataRows])
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
    || label === CANCELLATIONS_AND_NON_PICKUPS_LABEL
    || label === RETURNS_QUANTITY_LABEL
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

function findNextFreeSlot(reports: WbUploadedReport[]): WbWeeklySlot | null {
  const usedSlots = new Set(reports.map((r) => r.slot))
  return WB_WEEKLY_SLOTS.find((slot) => !usedSlots.has(slot)) ?? null
}

function findDuplicateByPeriod(reports: WbUploadedReport[], periodStart: string | null, periodEnd: string | null): WbUploadedReport | null {
  if (!periodStart || !periodEnd) return null
  return reports.find((r) => r.periodStart === periodStart && r.periodEnd === periodEnd) ?? null
}

function sortReportsByPeriod(reports: WbUploadedReport[]): WbUploadedReport[] {
  return [...reports].sort((a, b) => {
    const aEnd = a.periodEnd ?? ''
    const bEnd = b.periodEnd ?? ''
    if (aEnd > bEnd) return -1
    if (aEnd < bEnd) return 1
    return 0
  })
}

export function useWildberriesAnalyticsPage() {
  const [weeklyReports, setWeeklyReports] = useState<WbUploadedReport[]>([])
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

  const csvSource = useMemo(() => {
    const readyTexts = weeklyReports
      .filter((r) => r.status === 'ready')
      .map((r) => r.csvText)
    try {
      return mergeWeeklyCsvs(readyTexts)
    } catch {
      return null
    }
  }, [weeklyReports])

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

  const addWeeklyReport = useCallback(async (file: File, replaceId?: string): Promise<{ duplicate?: WbUploadedReport; added: boolean }> => {
    setUploadError('')
    setIsProcessing(true)

    try {
      const text = await readUploadFileAsCsv(file)

      const missingColumns = validateWildberriesWeeklyColumns(text)
      if (missingColumns.length > 0) {
        setUploadError(`В файле не найдены обязательные колонки отчёта: ${missingColumns.join(', ')}.`)
        return { added: false }
      }

      const { periodStart, periodEnd } = extractWildberriesPeriodFromCsv(text)

      if (!replaceId) {
        const duplicate = findDuplicateByPeriod(weeklyReports, periodStart, periodEnd)
        if (duplicate) {
          return { duplicate, added: false }
        }

        if (weeklyReports.length >= MAX_WEEKLY_REPORTS) {
          setUploadError(`Можно загрузить максимум ${MAX_WEEKLY_REPORTS} отчётов. Удалите один из загруженных отчётов.`)
          return { added: false }
        }
      }

      const slot = replaceId
        ? (weeklyReports.find((r) => r.id === replaceId)?.slot ?? findNextFreeSlot(weeklyReports))
        : findNextFreeSlot(weeklyReports)

      if (!slot) {
        setUploadError('Нет свободных слотов для загрузки отчёта.')
        return { added: false }
      }

      const newReport: WbUploadedReport = {
        id: replaceId ?? `${slot}-${Date.now()}`,
        slot,
        fileName: file.name,
        csvText: text,
        periodStart,
        periodEnd,
        uploadedAt: Date.now(),
        status: 'ready',
      }

      setWeeklyReports((prev) => {
        const withoutOld = replaceId ? prev.filter((r) => r.id !== replaceId) : prev
        return sortReportsByPeriod([...withoutOld, newReport])
      })

      try {
        await saveCsvRecord({
          mode: slot as CsvStorageMode,
          csvText: text,
          fileName: file.name,
          updatedAt: Date.now(),
        })
      } catch {
        // Ignore persistence errors.
      }

      return { added: true }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Не удалось обработать файл.')
      return { added: false }
    } finally {
      setIsProcessing(false)
    }
  }, [weeklyReports])

  const removeWeeklyReport = useCallback(async (reportId: string): Promise<void> => {
    const report = weeklyReports.find((r) => r.id === reportId)
    if (!report) return

    try {
      await deleteCsvRecord(report.slot as CsvStorageMode)
    } catch {
      // Ignore persistence errors.
    }

    setWeeklyReports((prev) => prev.filter((r) => r.id !== reportId))
    setUploadError('')
  }, [weeklyReports])

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

  const onCogsFileDelete = async (): Promise<void> => {
    try {
      await deleteCsvRecord('wildberriesCogs')
    } catch {
      // Ignore persistence errors.
    }
    setCogsCsvSource(null)
    setCogsFileName('')
    setCogsFallbackNote('')
  }

  useEffect(() => {
    let isCancelled = false
    const slotCount = WB_WEEKLY_SLOTS.length
    Promise.all([
      ...WB_WEEKLY_SLOTS.map((slot) => getCsvRecord(slot)),
      getCsvRecord('wildberriesCogs'),
      getCsvRecord('ozonCogs'),
    ])
      .then((results) => {
        if (isCancelled) return

        const slotRecords = results.slice(0, slotCount)
        const wbCogsRecord = results[slotCount]
        const ozonCogsRecord = results[slotCount + 1]
        const loadedReports: WbUploadedReport[] = []

        for (let i = 0; i < slotRecords.length; i++) {
          const record = slotRecords[i]
          if (!record) continue
          const slot = WB_WEEKLY_SLOTS[i]
          const { periodStart, periodEnd } = extractWildberriesPeriodFromCsv(record.csvText)
          loadedReports.push({
            id: `${slot}-${record.updatedAt}`,
            slot,
            fileName: record.fileName,
            csvText: record.csvText,
            periodStart,
            periodEnd,
            uploadedAt: record.updatedAt,
            status: 'ready',
          })
        }

        setWeeklyReports(sortReportsByPeriod(loadedReports))

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
    const reportCount = weeklyReports.filter((r) => r.status === 'ready').length
    const periodLabel = reports.find((r) => r.title === 'Итоги периода')?.periodLabel ?? ''
    const pdfSource = reportCount > 1 && periodLabel
      ? `${reportCount} отчётов, период ${periodLabel}`
      : weeklyReports.map((r) => r.fileName).filter(Boolean).join(' + ')

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
    await configurePdfFont(doc)
    renderPdfReport({
      doc,
      theme: PDF_THEMES.wildberries,
      title: 'Маркетплейс Метрика',
      subtitle: 'Wildberries / Отчет по поступлениям',
      source: pdfSource,
      sections: buildWildberriesPdfSections(reports),
    })
    doc.save(`wildberries-analytics-${Date.now()}.pdf`)
  }

  return {
    addWeeklyReport,
    articlePattern,
    cogsFallbackNote,
    cogsFileName,
    cogsMatchingMode,
    downloadPdf,
    error,
    hasResults,
    isArticlePatternExclude,
    isExtraParamsOpen,
    isProcessing,
    missingCogsArticles,
    onCogsFileDelete,
    onCogsFileUpload,
    onTaxRateChange,
    onVatRateChange,
    removeWeeklyReport,
    reports,
    setArticlePattern,
    setIsArticlePatternExclude,
    setIsExtraParamsOpen,
    setCogsMatchingMode,
    taxRatePercent,
    topProducts,
    vatRatePercent,
    weeklyReports,
  }
}
