import { useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { createPortal } from 'react-dom'
import './App.css'

type Marketplace = 'wildberries' | 'ozon'
type OzonCalculationType = 'unitEconomics' | 'accrualReport'
type ValueType = 'number' | 'currency' | 'percent'

type MetricKey =
  | 'sales'
  | 'returns'
  | 'buyout'
  | 'buyoutRate'
  | 'revenueBeforeSpp'
  | 'commission'
  | 'logistics'
  | 'acquiring'
  | 'tax'
  | 'cogs'
  | 'adsCost'
  | 'otherExpenses'
  | 'netRevenue'
  | 'marginRate'
  | 'drr'

type MetricView = {
  key: MetricKey
  label: string
  formula: string
  type: ValueType
}

type ReportMetric = {
  key: MetricKey
  label: string
  formula: string
  value: number | null
  ok: boolean
  type: ValueType
}

type ReportGroup = {
  title: string
  rowCount: number
  metrics: ReportMetric[]
}

type AccrualMetric = {
  label: string
  value: number | null
  type: ValueType
  formula: string
}

type AccrualGroup = {
  title: string
  rowCount?: number
  metrics: AccrualMetric[]
}

type TooltipState = {
  visible: boolean
  text: string
  x: number
  y: number
}

const METRICS: MetricView[] = [
  { key: 'sales', label: 'Продажи', formula: 'SUM("Заказано товаров, шт")', type: 'number' },
  { key: 'returns', label: 'Возвраты', formula: 'SUM("Возвращено товаров, шт")', type: 'number' },
  { key: 'buyout', label: 'Выкуплено', formula: 'SUM(Доставлено - Возвращено)', type: 'number' },
  { key: 'buyoutRate', label: '% выкупа', formula: 'Выкуплено / Продажи * 100%', type: 'percent' },
  { key: 'revenueBeforeSpp', label: 'Выручка до СПП', formula: 'SUM("Выручка")', type: 'currency' },
  { key: 'commission', label: 'Комиссия', formula: 'SUM("Вознаграждение Ozon")', type: 'currency' },
  { key: 'logistics', label: 'Логистика', formula: 'SUM("Логистика")', type: 'currency' },
  { key: 'acquiring', label: 'Эквайринг', formula: 'SUM("Эквайринг")', type: 'currency' },
  { key: 'tax', label: 'Налог (11%)', formula: 'SUM("Выручка") * 11%', type: 'currency' },
  { key: 'cogs', label: 'Себестоимость', formula: 'SUM("Себестоимость" * ("Доставлено" - "Возвращено"))', type: 'currency' },
  {
    key: 'adsCost',
    label: 'Расход на рекламу',
    formula: 'SUM(Оплата за клик + Оплата за заказ + Звёздные товары + Платный бренд + Отзывы + Доля от продаж)',
    type: 'currency',
  },
  {
    key: 'otherExpenses',
    label: 'Прочие расходы',
    formula: 'SUM(Обработка отправления + Доставка до места выдачи + Стоимость размещения + Обработка возврата + Обратная логистика + Утилизация + Дополнительная обработка ОВХ + Операционные ошибки)',
    type: 'currency',
  },
  {
    key: 'netRevenue',
    label: 'Чистая выручка',
    formula: 'SUM("Прибыль за период") - Налог (11%)',
    type: 'currency',
  },
  { key: 'marginRate', label: 'Маржинальность, %', formula: 'Чистая выручка / Выручка * 100%', type: 'percent' },
  { key: 'drr', label: 'ДРР продвижения, %', formula: 'Расход на рекламу / Выручка * 100%', type: 'percent' },
]

const AD_COLS = ['Оплата за клик', 'Оплата за заказ', 'Звёздные товары', 'Платный бренд', 'Отзывы', 'Доля от продаж']

const OTHER_EXPENSE_COLS = [
  'Обработка отправления',
  'Доставка до места выдачи',
  'Стоимость размещения',
  'Обработка возврата',
  'Обратная логистика',
  'Утилизация',
  'Дополнительная обработка ОВХ',
  'Операционные ошибки',
]

function parseCsv(content: string, delimiter = ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]

    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === delimiter && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i += 1
      row.push(cell)
      cell = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      continue
    }

    cell += ch
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

function normalize(value: string | undefined): string {
  return (value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseNumber(value: string | undefined): number | null {
  const normalized = normalize(value)
    .replace(/[₽%]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.')

  if (!normalized) return null
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatValue(value: number | null, type: ValueType): string {
  if (value === null) return 'n/a'
  if (type === 'percent') return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}%`
  if (type === 'currency') return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return window.btoa(binary)
}

async function configurePdfFont(doc: jsPDF): Promise<void> {
  const response = await fetch('/fonts/Arial.ttf')
  if (!response.ok) return
  const buffer = await response.arrayBuffer()
  const base64 = toBase64(new Uint8Array(buffer))
  doc.addFileToVFS('Arial.ttf', base64)
  doc.addFont('Arial.ttf', 'ArialCustom', 'normal')
  doc.setFont('ArialCustom')
}

function App() {
  const [activeTab, setActiveTab] = useState<Marketplace>('ozon')
  const [ozonCalculationType, setOzonCalculationType] = useState<OzonCalculationType>('unitEconomics')
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(METRICS.map((m) => m.key))
  const [reports, setReports] = useState<ReportGroup[] | null>(null)
  const [accrualReports, setAccrualReports] = useState<AccrualGroup[] | null>(null)
  const [error, setError] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, text: '', x: 0, y: 0 })
  const isOzonUnitEconomics = activeTab === 'ozon' && ozonCalculationType === 'unitEconomics'

  const selectedMetricSet = useMemo(() => new Set(selectedMetrics), [selectedMetrics])

  const toggleMetric = (key: MetricKey): void => {
    setSelectedMetrics((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  const selectAllMetrics = (): void => {
    setSelectedMetrics(METRICS.map((m) => m.key))
  }

  const clearMetrics = (): void => {
    setSelectedMetrics([])
  }

  const getMetricValueClassName = (value: number | null): string => {
    if (value === null) return 'metric-value'
    if (value > 0) return 'metric-value metric-value-positive'
    if (value < 0) return 'metric-value metric-value-negative'
    return 'metric-value'
  }

  const showTooltip = (
    event: React.MouseEvent<HTMLSpanElement> | React.FocusEvent<HTMLSpanElement>,
    text: string,
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      visible: true,
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    })
  }

  const hideTooltip = (): void => {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }

  const buildReport = (
    rowsSubset: string[][],
    headers: string[],
    getCell: (row: string[], colName: string) => string,
    title: string,
  ): ReportGroup => {
    const headerSet = new Set(headers)

    const sumCol = (name: string): number | null => {
      if (!headerSet.has(name)) return null
      let sum = 0
      for (const row of rowsSubset) {
        const n = parseNumber(getCell(row, name))
        if (n !== null) sum += n
      }
      return sum
    }

    const sales = sumCol('Заказано товаров, шт')
    const delivered = sumCol('Доставлено товаров, шт')
    const returns = sumCol('Возвращено товаров, шт')
    const revenue = sumCol('Выручка')
    const commission = sumCol('Вознаграждение Ozon')
    const logistics = sumCol('Логистика')
    const acquiring = sumCol('Эквайринг')
    const periodProfit = sumCol('Прибыль за период')
    const tax = revenue !== null ? revenue * 0.11 : null

    const hasAdsCols = AD_COLS.every((col) => headerSet.has(col))
    const adsCost = hasAdsCols ? AD_COLS.reduce((acc, col) => acc + (sumCol(col) || 0), 0) : null

    const hasOtherCols = OTHER_EXPENSE_COLS.every((col) => headerSet.has(col))
    const otherExpenses = hasOtherCols ? OTHER_EXPENSE_COLS.reduce((acc, col) => acc + (sumCol(col) || 0), 0) : null

    const cogs = rowsSubset.reduce((acc, row) => {
      const unitCost = parseNumber(getCell(row, 'Себестоимость'))
      const d = parseNumber(getCell(row, 'Доставлено товаров, шт'))
      const r = parseNumber(getCell(row, 'Возвращено товаров, шт'))
      if (unitCost === null || d === null || r === null) return acc
      return acc + unitCost * (d - r)
    }, 0)

    const buyout = delivered !== null && returns !== null ? delivered - returns : null
    const buyoutRate = buyout !== null && sales && sales !== 0 ? (buyout / sales) * 100 : null
    const netRevenue = periodProfit !== null && tax !== null ? periodProfit - tax : null
    const marginRate = netRevenue !== null && revenue && revenue !== 0 ? (netRevenue / revenue) * 100 : null
    const drr = adsCost !== null && revenue && revenue !== 0 ? (adsCost / revenue) * 100 : null

    const values: Record<MetricKey, number | null> = {
      sales,
      returns,
      buyout,
      buyoutRate,
      revenueBeforeSpp: revenue,
      commission,
      logistics,
      acquiring,
      tax,
      cogs,
      adsCost,
      otherExpenses,
      netRevenue,
      marginRate,
      drr,
    }

    const metrics: ReportMetric[] = METRICS.map((metric) => ({
      ...metric,
      value: values[metric.key],
      ok: values[metric.key] !== null,
    }))

    return { title, rowCount: rowsSubset.length, metrics }
  }

  const processOzonCsv = (rawCsv: string): ReportGroup[] => {
    const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), ';')
    const headerIndex = rows.findIndex((row) => normalize(row[0]) === 'SKU')
    if (headerIndex === -1) {
      throw new Error('Не найдена строка заголовков с колонкой SKU.')
    }

    const headers = rows[headerIndex].map((cell) => normalize(cell))
    const colIndex = new Map(headers.map((header, idx) => [header, idx]))

    const dataRows = rows
      .slice(headerIndex + 1)
      .filter((row) => normalize(row[0]) !== '')

    const getCell = (row: string[], colName: string): string => {
      const idx = colIndex.get(colName)
      if (idx === undefined) return ''
      return row[idx] || ''
    }

    const stRows = dataRows.filter((row) => normalize(getCell(row, 'Артикул')).toLowerCase().startsWith('st'))
    const otherRows = dataRows.filter((row) => !normalize(getCell(row, 'Артикул')).toLowerCase().startsWith('st'))

    return [
      buildReport(stRows, headers, getCell, 'Артикул начинается с "st"'),
      buildReport(otherRows, headers, getCell, 'Все остальные товары'),
    ]
  }

  const processOzonAccrualCsv = (rawCsv: string): AccrualGroup[] => {
    const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), ';')
    const headerIndex = rows.findIndex(
      (row) => normalize(row[0]) === 'ID начисления' && normalize(row[1]) === 'Дата начисления',
    )
    if (headerIndex === -1) {
      throw new Error('Не найдена строка заголовков отчета по начислениям.')
    }

    const headers = rows[headerIndex].map((cell) => normalize(cell))
    const colIndex = new Map(headers.map((header, idx) => [header, idx]))

    const dataRows = rows
      .slice(headerIndex + 1)
      .filter((row) => row.some((cell) => normalize(cell) !== ''))

    const getCell = (row: string[], colName: string): string => {
      const idx = colIndex.get(colName)
      if (idx === undefined) return ''
      return row[idx] || ''
    }

    const sumByGroup = new Map<string, number>()
    const sumByType = new Map<string, number>()
    const sumByDate = new Map<string, number>()
    const sumByScheme = new Map<string, number>()
    const sumByPlatform = new Map<string, number>()
    const groupTypeBreakdown = new Map<string, Map<string, number>>()

    let total = 0
    let positive = 0
    let negative = 0
    let positiveCount = 0
    let negativeCount = 0
    let zeroCount = 0

    const addToMap = (map: Map<string, number>, key: string, value: number): void => {
      map.set(key, (map.get(key) || 0) + value)
    }

    for (const row of dataRows) {
      const amount = parseNumber(getCell(row, 'Сумма итого, руб.'))
      if (amount === null) continue

      const group = normalize(getCell(row, 'Группа услуг')) || 'Без группы'
      const type = normalize(getCell(row, 'Тип начисления')) || 'Без типа'
      const date = normalize(getCell(row, 'Дата начисления')) || 'Без даты'
      const scheme = normalize(getCell(row, 'Схема работы')) || '(пусто)'
      const platform = normalize(getCell(row, 'Платформа продажи')) || '(пусто)'

      total += amount
      if (amount > 0) {
        positive += amount
        positiveCount += 1
      } else if (amount < 0) {
        negative += amount
        negativeCount += 1
      } else {
        zeroCount += 1
      }

      addToMap(sumByGroup, group, amount)
      addToMap(sumByType, type, amount)
      addToMap(sumByDate, date, amount)
      addToMap(sumByScheme, scheme, amount)
      addToMap(sumByPlatform, platform, amount)

      if (!groupTypeBreakdown.has(group)) {
        groupTypeBreakdown.set(group, new Map<string, number>())
      }
      addToMap(groupTypeBreakdown.get(group)!, type, amount)
    }

    const sortByAbsDesc = (entries: [string, number][]): [string, number][] =>
      entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

    const toMetrics = (
      entries: [string, number][],
      formulaBuilder: (label: string) => string,
      type: ValueType = 'currency',
    ): AccrualMetric[] =>
      entries.map(([label, value]) => ({ label, value, type, formula: formulaBuilder(label) }))

    const groupSummaries: AccrualGroup[] = Array.from(groupTypeBreakdown.entries())
      .map(([group, types]) => {
        const topTypes = sortByAbsDesc(Array.from(types.entries())).slice(0, 3)
        const total = Array.from(types.values()).reduce((acc, value) => acc + value, 0)
        return {
          title: `Структура: ${group}`,
          metrics: toMetrics(
            topTypes,
            (label) => `SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "${group}" и "Тип начисления" = "${label}"`,
          ),
          total,
        }
      })
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .map(({ title, metrics }) => ({ title, metrics }))

    return [
      {
        title: 'Итоги периода',
        rowCount: dataRows.length,
        metrics: [
          { label: 'Итог по начислениям', value: total, type: 'currency', formula: 'SUM("Сумма итого, руб.")' },
          { label: 'Положительные начисления', value: positive, type: 'currency', formula: 'SUM("Сумма итого, руб." > 0)' },
          { label: 'Отрицательные начисления', value: negative, type: 'currency', formula: 'SUM("Сумма итого, руб." < 0)' },
          { label: 'Среднее начисление на строку', value: dataRows.length ? total / dataRows.length : null, type: 'currency', formula: 'SUM("Сумма итого, руб.") / COUNT(строк)' },
          { label: 'Строк с плюсами', value: positiveCount, type: 'number', formula: 'COUNT("Сумма итого, руб." > 0)' },
          { label: 'Строк с минусами', value: negativeCount, type: 'number', formula: 'COUNT("Сумма итого, руб." < 0)' },
          { label: 'Строк с нулем', value: zeroCount, type: 'number', formula: 'COUNT("Сумма итого, руб." = 0)' },
        ],
      },
      {
        title: 'Группы услуг',
        metrics: toMetrics(
          sortByAbsDesc(Array.from(sumByGroup.entries())),
          (label) => `SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "${label}"`,
        ),
      },
      {
        title: 'Типы начислений (топ 15)',
        metrics: toMetrics(
          sortByAbsDesc(Array.from(sumByType.entries())).slice(0, 15),
          (label) => `SUM("Сумма итого, руб."), фильтр: "Тип начисления" = "${label}"`,
        ),
      },
      {
        title: 'Схема работы',
        metrics: toMetrics(
          sortByAbsDesc(Array.from(sumByScheme.entries())),
          (label) => `SUM("Сумма итого, руб."), фильтр: "Схема работы" = "${label}"`,
        ),
      },
      {
        title: 'Платформа продажи',
        metrics: toMetrics(
          sortByAbsDesc(Array.from(sumByPlatform.entries())),
          (label) => `SUM("Сумма итого, руб."), фильтр: "Платформа продажи" = "${label}"`,
        ),
      },
      {
        title: 'Динамика по датам начисления',
        metrics: Array.from(sumByDate.entries())
          .sort(([a], [b]) => {
            const [da, ma, ya] = a.split('.').map(Number)
            const [db, mb, yb] = b.split('.').map(Number)
            const ta = new Date(ya, ma - 1, da).getTime()
            const tb = new Date(yb, mb - 1, db).getTime()
            return ta - tb
          })
          .map(([label, value]) => ({
            label,
            value,
            type: 'currency',
            formula: `SUM("Сумма итого, руб."), фильтр: "Дата начисления" = "${label}"`,
          })),
      },
      ...groupSummaries,
    ]
  }

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    setReports(null)
    setAccrualReports(null)
    setFileName(file.name)
    setIsProcessing(true)

    try {
      const text = await file.text()
      if (activeTab === 'wildberries') {
        throw new Error('Расчёт для Wildberries пока не реализован.')
      }
      if (ozonCalculationType === 'accrualReport') {
        const builtAccrualReports = processOzonAccrualCsv(text)
        setAccrualReports(builtAccrualReports)
        return
      }
      const builtReports = processOzonCsv(text)
      setReports(builtReports)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать файл.')
    } finally {
      setIsProcessing(false)
    }
  }

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
          const line1 = `${metric.label}: ${metric.ok ? formatValue(metric.value, metric.type) : 'нет данных'}`
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
    }

    if (!isOzonUnitEconomics && accrualReports) {
      for (const report of accrualReports) {
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
        <button
          className={`tab ${activeTab === 'wildberries' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('wildberries')
            setReports(null)
            setAccrualReports(null)
            setError('')
          }}
          type="button"
        >
          Wildberries
        </button>
        <button
          className={`tab ${activeTab === 'ozon' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('ozon')
            setReports(null)
            setAccrualReports(null)
            setError('')
          }}
          type="button"
        >
          Ozon
        </button>
      </section>

      {activeTab === 'ozon' && (
        <section className="panel">
          <div className="panel-head">
            <h2>Вариант расчёта</h2>
          </div>
          <section className="tabs" aria-label="Вариант расчёта для Ozon">
            <button
              className={`tab ${ozonCalculationType === 'unitEconomics' ? 'active' : ''}`}
              onClick={() => {
                setOzonCalculationType('unitEconomics')
                setReports(null)
                setAccrualReports(null)
                setError('')
              }}
              type="button"
            >
              Юнит экономика
            </button>
            <button
              className={`tab ${ozonCalculationType === 'accrualReport' ? 'active' : ''}`}
              onClick={() => {
                setOzonCalculationType('accrualReport')
                setReports(null)
                setAccrualReports(null)
                setError('')
              }}
              type="button"
            >
              Отчет по начислениям
            </button>
          </section>
        </section>
      )}

      {isOzonUnitEconomics && (
        <section className="panel">
          <div className="panel-head">
            <h2>Метрики для расчёта</h2>
            <div className="panel-actions">
              <button type="button" onClick={selectAllMetrics}>Выбрать всё</button>
              <button type="button" onClick={clearMetrics}>Снять всё</button>
            </div>
          </div>

          <div className="metrics-grid">
            {METRICS.map((metric) => (
              <label key={metric.key} className="metric-item">
                <input
                  type="checkbox"
                  checked={selectedMetricSet.has(metric.key)}
                  onChange={() => toggleMetric(metric.key)}
                />
                <span>{metric.label}</span>
              </label>
            ))}
          </div>
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
        <section className="reports">
          {reports.map((report) => {
            const visibleMetrics = report.metrics.filter((metric) => selectedMetricSet.has(metric.key))
            return (
              <article className="report-card" key={report.title}>
                <header>
                  <h3>{report.title}</h3>
                  <p>Строк товаров: {report.rowCount}</p>
                </header>

                <div className="result-list">
                  {visibleMetrics.map((metric) => (
                    <div key={metric.key} className="result-row">
                      <p className="metric-title">
                        {metric.label}
                        <span
                          className="metric-tooltip"
                          aria-label={`Формула: ${metric.formula}`}
                          tabIndex={0}
                          onMouseEnter={(event) => showTooltip(event, metric.formula)}
                          onMouseLeave={hideTooltip}
                          onFocus={(event) => showTooltip(event, metric.formula)}
                          onBlur={hideTooltip}
                        >
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M10 7.04163V10.375M17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5C14.1421 2.5 17.5 5.85786 17.5 10ZM9.9585 12.875H10.0418V12.9583H9.9585V12.875Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      </p>
                      <p className={getMetricValueClassName(metric.ok ? metric.value : null)}>
                        {metric.ok ? formatValue(metric.value, metric.type) : 'нет данных'}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </section>
      )}

      {accrualReports && !isOzonUnitEconomics && (
        <section className="reports">
          {accrualReports.map((report) => (
            <article className="report-card" key={report.title}>
              <header>
                <h3>{report.title}</h3>
                {typeof report.rowCount === 'number' && <p>Строк начислений: {report.rowCount}</p>}
              </header>

              <div className="result-list">
                {report.metrics.map((metric) => (
                  <div key={`${report.title}-${metric.label}`} className="result-row result-row-compact">
                    <p className="metric-title">
                      {metric.label}
                      <span
                        className="metric-tooltip"
                        aria-label={`Формула: ${metric.formula}`}
                        tabIndex={0}
                        onMouseEnter={(event) => showTooltip(event, metric.formula)}
                        onMouseLeave={hideTooltip}
                        onFocus={(event) => showTooltip(event, metric.formula)}
                        onBlur={hideTooltip}
                      >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M10 7.04163V10.375M17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5C14.1421 2.5 17.5 5.85786 17.5 10ZM9.9585 12.875H10.0418V12.9583H9.9585V12.875Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    </p>
                    <p className={getMetricValueClassName(metric.value)}>{formatValue(metric.value, metric.type)}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
      {tooltip.visible && typeof document !== 'undefined' && createPortal(
        <div
          className="formula-tooltip-portal"
          role="tooltip"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
        >
          {tooltip.text}
        </div>,
        document.body,
      )}
    </main>
  )
}

export default App
