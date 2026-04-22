import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { jsPDF } from 'jspdf'
import type { AccrualGroup } from '@/entities/ozon-report/model/types'
import { buildWildberriesAccrualReports } from '@/entities/wildberries-report'
import { formatValue } from '@/shared/lib/csv'
import { configurePdfFont } from '@/shared/lib/pdf'

const VAT_RATE_STORAGE_KEY = 'wildberries_accrual_vat_rate_percent'
const TAX_RATE_STORAGE_KEY = 'wildberries_accrual_tax_rate_percent'
const DEFAULT_VAT_RATE = 5
const DEFAULT_TAX_RATE = 6

function readStoredRate(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
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
      const valueText = formatValue(metric.value, metric.type)
      const line = metric.shareText
        ? `${metric.label}: ${valueText} — ${metric.shareText}`
        : `${metric.label}: ${valueText}`
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

export function useWildberriesAnalyticsPage() {
  const [csvSource, setCsvSource] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExtraParamsOpen, setIsExtraParamsOpen] = useState(false)
  const [articlePattern, setArticlePattern] = useState('*')
  const [vatRatePercent, setVatRatePercent] = useState<number>(() => readStoredRate(VAT_RATE_STORAGE_KEY, DEFAULT_VAT_RATE))
  const [taxRatePercent, setTaxRatePercent] = useState<number>(() => readStoredRate(TAX_RATE_STORAGE_KEY, DEFAULT_TAX_RATE))

  const reportBuild = useMemo(() => {
    if (!csvSource) return { reports: null as AccrualGroup[] | null, error: '' }
    try {
      return {
        reports: buildWildberriesAccrualReports(csvSource, vatRatePercent, taxRatePercent, articlePattern),
        error: '',
      }
    } catch (err) {
      return {
        reports: null,
        error: err instanceof Error ? err.message : 'Не удалось построить отчёт Wildberries.',
      }
    }
  }, [articlePattern, csvSource, taxRatePercent, vatRatePercent])

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
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Не удалось обработать файл.')
    } finally {
      setIsProcessing(false)
      event.target.value = ''
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
    if (!reports) return

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
    doc.text('Marketplace Analytics — Wildberries / Отчет по поступлениям', margin + 4, y + 8)
    doc.setFontSize(9)
    doc.text(`Источник: ${fileName}`, margin + 4, y + 14)
    y += 26

    renderAccrualPdf(doc, reports, margin, contentWidth, y, ensureSpace)
    doc.save(`wildberries-analytics-${Date.now()}.pdf`)
  }

  return {
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
  }
}
