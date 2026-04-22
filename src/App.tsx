import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { AccrualResults } from './components/AccrualResults'
import { UnitEconomicsResults } from './components/UnitEconomicsResults'
import { METRICS } from './constants/metrics'
import { buildAccrualReports, buildUnitEconomicsReports } from './features/ozon/reportBuilders'
import { getUnitMetricDisplayValue } from './features/ozon/unitMetricView'
import type { AccrualGroup, Marketplace, MetricKey, OzonCalculationType, ReportGroup } from './types/reports'
import { configurePdfFont } from './utils/pdf'
import { formatValue } from './utils/csv'
import './App.css'

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

function getMetricValueClassName(value: number | null): string {
  if (value === null) return 'metric-value'
  if (value > 0) return 'metric-value metric-value-positive'
  if (value < 0) return 'metric-value metric-value-negative'
  return 'metric-value'
}

function renderUnitEconomicsPdf(
  doc: jsPDF,
  reports: ReportGroup[],
  selectedMetricSet: Set<MetricKey>,
  margin: number,
  contentWidth: number,
  startY: number,
  ensureSpace: (height: number) => void,
): number {
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

    const selected = report.metrics.filter((metric) => selectedMetricSet.has(metric.key))
    for (const metric of selected) {
      const line1 = `${metric.label}: ${getUnitMetricDisplayValue(metric, report)}`
      const line2 = `Формула: ${metric.formula}`
      const lines = [...doc.splitTextToSize(line1, contentWidth - 6), ...doc.splitTextToSize(line2, contentWidth - 6)]
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
  return y
}

function renderAccrualPdf(
  doc: jsPDF,
  reports: AccrualGroup[],
  margin: number,
  contentWidth: number,
  startY: number,
  ensureSpace: (height: number) => void,
): number {
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
  return y
}

function App() {
  const [activeTab, setActiveTab] = useState<Marketplace>('ozon')
  const [ozonCalculationType, setOzonCalculationType] = useState<OzonCalculationType>('unitEconomics')
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(METRICS.map((m) => m.key))
  const [reports, setReports] = useState<ReportGroup[] | null>(null)
  const [accrualReports, setAccrualReports] = useState<AccrualGroup[] | null>(null)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExtraParamsOpen, setIsExtraParamsOpen] = useState(false)
  const [isMetricsOpen, setIsMetricsOpen] = useState(false)
  const [articlePattern, setArticlePattern] = useState('st*')
  const [unitCsvSource, setUnitCsvSource] = useState<string | null>(null)
  const [vatRatePercent, setVatRatePercent] = useState<number>(() => readStoredRate(VAT_RATE_STORAGE_KEY, DEFAULT_VAT_RATE))
  const [taxRatePercent, setTaxRatePercent] = useState<number>(() => readStoredRate(TAX_RATE_STORAGE_KEY, DEFAULT_TAX_RATE))

  const isOzonUnitEconomics = activeTab === 'ozon' && ozonCalculationType === 'unitEconomics'
  const selectedMetricSet = useMemo(() => new Set<MetricKey>(selectedMetrics), [selectedMetrics])

  const resetResults = (): void => {
    setReports(null)
    setAccrualReports(null)
    setUnitCsvSource(null)
    setError('')
  }

  const onSwitchMarketplace = (marketplace: Marketplace): void => {
    setActiveTab(marketplace)
    resetResults()
  }

  const onSwitchOzonCalculation = (calcType: OzonCalculationType): void => {
    setOzonCalculationType(calcType)
    resetResults()
  }

  const toggleMetric = (key: MetricKey): void => {
    setSelectedMetrics((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  const selectAllMetrics = (): void => setSelectedMetrics(METRICS.map((m) => m.key))
  const clearMetrics = (): void => setSelectedMetrics([])

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return

    resetResults()
    setFileName(file.name)
    setIsProcessing(true)

    try {
      const text = await file.text()
      if (activeTab === 'wildberries') {
        throw new Error('Расчёт для Wildberries пока не реализован.')
      }

      if (ozonCalculationType === 'accrualReport') {
        setUnitCsvSource(null)
        setAccrualReports(buildAccrualReports(text))
      } else {
        setUnitCsvSource(text)
        setReports(buildUnitEconomicsReports(text, articlePattern, vatRatePercent, taxRatePercent))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать файл.')
    } finally {
      setIsProcessing(false)
    }
  }

  useEffect(() => {
    if (!isOzonUnitEconomics) return
    if (!unitCsvSource) return
    try {
      setReports(buildUnitEconomicsReports(unitCsvSource, articlePattern, vatRatePercent, taxRatePercent))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось применить фильтр по артикулу.')
    }
  }, [articlePattern, isOzonUnitEconomics, unitCsvSource, vatRatePercent, taxRatePercent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VAT_RATE_STORAGE_KEY, String(vatRatePercent))
  }, [vatRatePercent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TAX_RATE_STORAGE_KEY, String(taxRatePercent))
  }, [taxRatePercent])

  const downloadPdf = async (): Promise<void> => {
    if (isOzonUnitEconomics && !reports) return
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

    if (isOzonUnitEconomics && reports) {
      renderUnitEconomicsPdf(doc, reports, selectedMetricSet, margin, contentWidth, y, ensureSpace)
    }
    if (!isOzonUnitEconomics && accrualReports) {
      renderAccrualPdf(doc, accrualReports, margin, contentWidth, y, ensureSpace)
    }

    doc.save(`ozon-analytics-${Date.now()}.pdf`)
  }

  return (
    <main className="page">
      <header className="hero-block">
        <p className="eyebrow">Marketplace Analytics</p>
        <h1>Аналитика продаж маркетплейсов</h1>
        <p className="subtitle">Выберите площадку, метрики и загрузите CSV. Расчёт и отчёт в PDF формируются на лету.</p>
      </header>

      <section className="tabs" aria-label="Выбор площадки">
        <button className={`tab ${activeTab === 'wildberries' ? 'active' : ''}`} onClick={() => onSwitchMarketplace('wildberries')} type="button">
          Wildberries
        </button>
        <button className={`tab ${activeTab === 'ozon' ? 'active' : ''}`} onClick={() => onSwitchMarketplace('ozon')} type="button">
          Ozon
        </button>
      </section>

      {activeTab === 'ozon' && (
        <section className="panel">
          <div className="panel-head">
            <h2>Вариант расчёта</h2>
          </div>
          <section className="tabs" aria-label="Вариант расчёта для Ozon">
            <button className={`tab ${ozonCalculationType === 'unitEconomics' ? 'active' : ''}`} onClick={() => onSwitchOzonCalculation('unitEconomics')} type="button">
              Юнит экономика
            </button>
            <button className={`tab ${ozonCalculationType === 'accrualReport' ? 'active' : ''}`} onClick={() => onSwitchOzonCalculation('accrualReport')} type="button">
              Отчет по начислениям
            </button>
          </section>
        </section>
      )}

      {isOzonUnitEconomics && (
        <section className="panel extra-params-panel">
          <button
            className="metrics-toggle"
            type="button"
            onClick={() => setIsExtraParamsOpen((prev) => !prev)}
            aria-expanded={isExtraParamsOpen}
          >
            <span>Дополнительные параметры</span>
            <span className={`metrics-toggle-icon ${isExtraParamsOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
          </button>

          {isExtraParamsOpen && (
            <div className="extra-params-content">
              <div className="tax-rates-grid">
                <label className="tax-rate-field" htmlFor="vatRateInput">
                  <span>НДС, %</span>
                  <input
                    id="vatRateInput"
                    type="number"
                    min="0"
                    step="0.1"
                    value={vatRatePercent}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setVatRatePercent(Number.isFinite(next) ? next : 0)
                    }}
                  />
                </label>
                <label className="tax-rate-field" htmlFor="taxRateInput">
                  <span>Налог, %</span>
                  <input
                    id="taxRateInput"
                    type="number"
                    min="0"
                    step="0.1"
                    value={taxRatePercent}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setTaxRatePercent(Number.isFinite(next) ? next : 0)
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </section>
      )}

      {isOzonUnitEconomics && (
        <section className="panel">
          <div className="panel-head">
            <h2>Фильтр артикулов</h2>
          </div>
          <div className="article-filter">
            <label htmlFor="articlePatternInput">Паттерн</label>
            <input
              id="articlePatternInput"
              type="text"
              value={articlePattern}
              onChange={(event) => setArticlePattern(event.target.value)}
              placeholder="Например: st*"
            />
            <p className="filter-hint">Поддерживаются шаблоны: `*` — любые символы, `?` — один символ.</p>
          </div>
        </section>
      )}

      {isOzonUnitEconomics && (
        <section className="panel metrics-panel">
          <button
            className="metrics-toggle"
            type="button"
            onClick={() => setIsMetricsOpen((prev) => !prev)}
            aria-expanded={isMetricsOpen}
          >
            <span>Метрики для расчёта</span>
            <span className={`metrics-toggle-icon ${isMetricsOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
          </button>

          {isMetricsOpen && (
            <div className="metrics-content">
              <div className="panel-actions">
                <button type="button" onClick={selectAllMetrics}>Выбрать всё</button>
                <button type="button" onClick={clearMetrics}>Снять всё</button>
              </div>

              <div className="metrics-grid">
                {METRICS.map((metric) => (
                  <label key={metric.key} className="metric-item">
                    <input type="checkbox" checked={selectedMetricSet.has(metric.key)} onChange={() => toggleMetric(metric.key)} />
                    <span>{metric.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="panel controls">
        <h2>Загрузка файла</h2>
        <div className="control-row">
          <input type="file" accept=".csv,text/csv" onChange={onFileUpload} disabled={isProcessing} />
          <button
            type="button"
            onClick={downloadPdf}
            disabled={isProcessing || (isOzonUnitEconomics ? !reports : !accrualReports)}
          >
            Скачать в PDF
          </button>
        </div>
        {isProcessing && <p className="loader">Анализирую файл, подождите…</p>}
        {fileName && <p className="file-meta">Файл: {fileName}</p>}
        {activeTab === 'wildberries' && <p className="warning">Расчёт для Wildberries пока в разработке. Переключитесь на вкладку Ozon.</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {reports && isOzonUnitEconomics && (
        <UnitEconomicsResults
          reports={reports}
          selectedMetricSet={selectedMetricSet}
          getMetricValueClassName={getMetricValueClassName}
        />
      )}

      {accrualReports && !isOzonUnitEconomics && (
        <AccrualResults
          reports={accrualReports}
          getMetricValueClassName={getMetricValueClassName}
        />
      )}
    </main>
  )
}

export default App
