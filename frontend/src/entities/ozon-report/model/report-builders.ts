import { AD_COLS, LOGISTICS_COLS, METRICS, OTHER_EXPENSE_COLS, REVERSE_LOGISTICS_COLS } from '@/entities/ozon-report/config/metrics'
import { OZON_ACCRUAL_COLUMNS, OZON_CSV_LAYOUT, OZON_UNIT_COLUMNS } from '@/entities/ozon-report/model/columns'
import type { AccrualGroup, AccrualMetric, AvailabilityGroups, ReportGroup, ValueType } from '@/entities/ozon-report/model/types'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'

const GROUPED_EXPENSES_REPORT_TITLE = 'Общие затраты по Маркетплейсу'
const SALES_GROUP_LABEL = 'Продажи'

function formatDateLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = String(date.getUTCFullYear())
  return `${day}.${month}.${year}`
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null
  if (serial < 1 || serial > 100000) return null
  const timestamp = Date.UTC(1899, 11, 30) + Math.round(serial) * 24 * 60 * 60 * 1000
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseAccrualDateLabelToTimestamp(raw: string): number | null {
  const normalized = normalize(raw)
  if (!normalized || normalized === 'Без даты') return null

  const serialMatch = normalized.match(/^\d+(?:[.,]\d+)?$/)
  if (serialMatch) {
    const serial = Number(normalized.replace(',', '.'))
    const date = excelSerialToDate(serial)
    return date ? date.getTime() : null
  }

  const [day, month, year] = normalized.split('.').map(Number)
  if ([day, month, year].some((part) => Number.isNaN(part))) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function normalizeAccrualDateLabel(raw: string): string {
  const normalized = normalize(raw)
  if (!normalized) return ''
  const timestamp = parseAccrualDateLabelToTimestamp(normalized)
  if (timestamp === null) return normalized
  return formatDateLabel(new Date(timestamp))
}

function hasHeaderCell(row: string[], headerName: string): boolean {
  return row.some((cell) => normalize(cell) === headerName)
}

function findHeaderRowIndex(rows: string[][], requiredHeaders: string[]): number {
  return rows.findIndex((row) => requiredHeaders.every((header) => hasHeaderCell(row, header)))
}

function patternToRegex(pattern: string): RegExp | null {
  const normalized = pattern.trim()
  if (!normalized) return null

  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')

  return new RegExp(`^${escaped}$`, 'i')
}

function matchesArticlePattern(article: string, pattern: string): boolean {
  const regex = patternToRegex(pattern)
  if (!regex) return true
  return regex.test(article)
}

function isArticleIncludedByPattern(article: string, pattern: string, excludePattern: boolean): boolean {
  const isMatched = matchesArticlePattern(article, pattern)
  return excludePattern ? !isMatched : isMatched
}

function buildUnitEconomicsReport(
  rowsSubset: string[][],
  headers: string[],
  getCell: (row: string[], colName: string) => string,
  vatRatePercent: number,
  taxRatePercent: number,
  title: string,
): ReportGroup {
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

  const sales = sumCol(OZON_UNIT_COLUMNS.orderedQty)
  const delivered = sumCol(OZON_UNIT_COLUMNS.deliveredQty)
  const returns = sumCol(OZON_UNIT_COLUMNS.returnedQty)
  const revenue = sumCol(OZON_UNIT_COLUMNS.revenue)
  const accruedPoints = sumCol(OZON_UNIT_COLUMNS.pointsPrimary) ?? sumCol(OZON_UNIT_COLUMNS.pointsAlt)
  const partnerCompensation = sumCol(OZON_UNIT_COLUMNS.partnerProgramsPrimary) ?? sumCol(OZON_UNIT_COLUMNS.partnerProgramsAlt)
  const commission = sumCol(OZON_UNIT_COLUMNS.commissionPrimary) ?? sumCol(OZON_UNIT_COLUMNS.commissionAlt)
  const sumDefinedCols = (names: string[]): number | null => {
    const values = names.map((name) => sumCol(name)).filter((v): v is number => v !== null)
    if (values.length === 0) return null
    return values.reduce((acc, value) => acc + value, 0)
  }

  const logistics = sumDefinedCols(LOGISTICS_COLS)
  const reverseLogistics = sumDefinedCols(REVERSE_LOGISTICS_COLS)
  const acquiring = sumCol(OZON_UNIT_COLUMNS.acquiring)
  const periodProfit = sumCol(OZON_UNIT_COLUMNS.periodProfit)

  const hasAdsCols = AD_COLS.every((col) => headerSet.has(col))
  const adsCost = hasAdsCols ? AD_COLS.reduce((acc, col) => acc + (sumCol(col) || 0), 0) : null

  const otherExpenses = sumDefinedCols(OTHER_EXPENSE_COLS)

  const cogs = rowsSubset.reduce((acc, row) => {
    const unitCost = parseNumber(getCell(row, OZON_UNIT_COLUMNS.cogs))
    const d = parseNumber(getCell(row, OZON_UNIT_COLUMNS.deliveredQty))
    const r = parseNumber(getCell(row, OZON_UNIT_COLUMNS.returnedQty))
    if (unitCost === null || d === null || r === null) return acc
    return acc + unitCost * (d - r)
  }, 0)

  const buyout = delivered !== null && returns !== null ? delivered - returns : null
  const buyoutRate = buyout !== null && returns !== null && buyout + returns !== 0
    ? (buyout / (buyout + returns)) * 100
    : null
  const hasRevenueBeforeSppParts = revenue !== null || accruedPoints !== null || partnerCompensation !== null
  const revenueBeforeSpp = hasRevenueBeforeSppParts
    ? (revenue ?? 0) + (accruedPoints ?? 0) + (partnerCompensation ?? 0)
    : null
  const totalRate = (vatRatePercent + taxRatePercent) / 100
  const tax = revenueBeforeSpp !== null ? revenueBeforeSpp * totalRate : null
  const netRevenue = periodProfit !== null && tax !== null ? periodProfit - tax : null
  const marginRate = netRevenue !== null && revenue && revenue !== 0 ? (netRevenue / revenue) * 100 : null

  const values: Record<(typeof METRICS)[number]['key'], number | null> = {
    sales,
    returns,
    cancellations: null,
    buyout,
    buyoutRate,
    revenueBeforeSpp,
    revenueAfterSpp: revenue,
    accruedPoints,
    partnerCompensation,
    commission,
    logistics,
    reverseLogistics,
    acquiring,
    tax,
    cogs,
    adsCost,
    otherExpenses,
    netRevenue,
    marginRate,
  }

  const metrics = METRICS.map((metric) => {
    const value = values[metric.key]
    if (metric.key === 'tax') {
      return {
        ...metric,
        value,
        ok: value !== null,
        formula: `(${taxRatePercent}% + ${vatRatePercent}%) * Выручка с учетом СПП`,
      }
    }
    return {
      ...metric,
      value,
      ok: value !== null,
    }
  })

  const availabilityGroups: AvailabilityGroups = {
    urgent: [],
    maintain: [],
    enough: [],
  }

  if (headerSet.has(OZON_UNIT_COLUMNS.article) && headerSet.has(OZON_UNIT_COLUMNS.availability)) {
    const urgent = new Set<string>()
    const maintain = new Set<string>()
    const enough = new Set<string>()

    for (const row of rowsSubset) {
      const article = normalize(getCell(row, OZON_UNIT_COLUMNS.article))
      const availability = normalize(getCell(row, OZON_UNIT_COLUMNS.availability)).toLowerCase()
      if (!article || !availability) continue

      if (availability === 'срочно поставить') {
        urgent.add(article)
        continue
      }
      if (availability === 'поддерживайте остаток') {
        maintain.add(article)
        continue
      }
      if (availability === 'пока хватает') {
        enough.add(article)
      }
    }

    const sortArticles = (set: Set<string>): string[] => Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
    availabilityGroups.urgent = sortArticles(urgent)
    availabilityGroups.maintain = sortArticles(maintain)
    availabilityGroups.enough = sortArticles(enough)
  }

  const productMargins: { article: string, marginSharePercent: number, profitPerUnit: number | null }[] = []
  if (headerSet.has(OZON_UNIT_COLUMNS.article) && headerSet.has(OZON_UNIT_COLUMNS.salesShare)) {
    const marginByArticle = new Map<string, { marginSum: number, marginCount: number, profitSum: number, profitCount: number }>()
    for (const row of rowsSubset) {
      const article = normalize(getCell(row, OZON_UNIT_COLUMNS.article))
      const margin = parseNumber(getCell(row, OZON_UNIT_COLUMNS.salesShare))
      const profitPerUnit = parseNumber(getCell(row, OZON_UNIT_COLUMNS.unitProfit))
      if (!article || margin === null) continue

      const current = marginByArticle.get(article) || { marginSum: 0, marginCount: 0, profitSum: 0, profitCount: 0 }
      current.marginSum += margin
      current.marginCount += 1
      if (profitPerUnit !== null) {
        current.profitSum += profitPerUnit
        current.profitCount += 1
      }
      marginByArticle.set(article, current)
    }

    for (const [article, stats] of marginByArticle.entries()) {
      productMargins.push({
        article,
        marginSharePercent: stats.marginSum / stats.marginCount,
        profitPerUnit: stats.profitCount > 0 ? stats.profitSum / stats.profitCount : null,
      })
    }
  }

  return { title, rowCount: rowsSubset.length, metrics, availabilityGroups, productMargins }
}

export function buildUnitEconomicsReports(
  rawCsv: string,
  articlePattern: string,
  vatRatePercent: number,
  taxRatePercent: number,
  excludePattern = false,
): ReportGroup[] {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), OZON_CSV_LAYOUT.delimiter)
  const headerIndex = findHeaderRowIndex(rows, [
    OZON_CSV_LAYOUT.unitHeaderFirstCell,
    OZON_UNIT_COLUMNS.article,
    OZON_UNIT_COLUMNS.revenue,
  ])
  if (headerIndex === -1) {
    throw new Error(`Не найдена строка заголовков с колонкой ${OZON_CSV_LAYOUT.unitHeaderFirstCell}.`)
  }

  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))

  const dataRows = rows.slice(headerIndex + 1).filter((row) => normalize(row[0]) !== '')

  const getCell = (row: string[], colName: string): string => {
    const idx = colIndex.get(colName)
    if (idx === undefined) return ''
    return row[idx] || ''
  }

  const matchedRows = dataRows.filter((row) => isArticleIncludedByPattern(
    normalize(getCell(row, OZON_UNIT_COLUMNS.article)),
    articlePattern,
    excludePattern,
  ))
  const normalizedPattern = articlePattern.trim()
  const hasActivePattern = normalizedPattern !== '' && normalizedPattern !== '*'
  const printablePattern = normalizedPattern || '*'
  const reportTitle = !hasActivePattern
    ? 'Юнит-экономика'
    : excludePattern
      ? `Юнит-экономика по артикулам вне паттерна "${printablePattern}"`
      : `Юнит-экономика по выбранным артикулам "${printablePattern}"`

  return [
    buildUnitEconomicsReport(
      matchedRows,
      headers,
      getCell,
      vatRatePercent,
      taxRatePercent,
      reportTitle,
    ),
  ]
}

function normalizeArticleKey(article: string): string {
  return normalize(article).toLowerCase()
}

function parseCsvWithDelimiterFallback(rawCsv: string): string[][] {
  const normalized = rawCsv.replace(/^\uFEFF/, '')
  const semicolonRows = parseCsv(normalized, OZON_CSV_LAYOUT.delimiter)
  if (semicolonRows.some((row) => row.length > 1)) return semicolonRows
  return parseCsv(normalized, ',')
}

function findCogsHeader(headers: string[]): { articleIdx: number, cogsIdx: number } | null {
  const normalizedHeaders = headers.map((header) => normalize(header).toLowerCase().replace(/ё/g, 'е'))
  const articleIdx = normalizedHeaders.findIndex(
    (header) => header === normalize(OZON_UNIT_COLUMNS.article).toLowerCase().replace(/ё/g, 'е'),
  )
  if (articleIdx === -1) return null

  const cogsIdx = normalizedHeaders.findIndex(
    (header) => header === normalize(OZON_UNIT_COLUMNS.cogs).toLowerCase().replace(/ё/g, 'е'),
  )
  if (cogsIdx === -1) return null

  return { articleIdx, cogsIdx }
}

type CogsRow = {
  article: string
  cogs: number
}

function parseOzonCogsRows(rawCsv: string): CogsRow[] | null {
  const rows = parseCsvWithDelimiterFallback(rawCsv)
  const headerIndex = rows.findIndex((row) => findCogsHeader(row) !== null)
  if (headerIndex === -1) return null

  const header = findCogsHeader(rows[headerIndex])
  if (!header) return null

  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => normalize(cell) !== ''))

  const result: CogsRow[] = []
  for (const row of dataRows) {
    const article = normalize(row[header.articleIdx] || '')
    const cogs = parseNumber(row[header.cogsIdx] || '')
    if (!article || cogs === null) continue
    result.push({ article, cogs })
  }
  return result
}

function escapeCsvCell(value: string): string {
  if (!/[;"\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

export function extractOzonCogsCsv(rawCsv: string): string | null {
  const parsedRows = parseOzonCogsRows(rawCsv)
  if (!parsedRows) return null

  const lines = [`${OZON_UNIT_COLUMNS.article};${OZON_UNIT_COLUMNS.cogs}`]
  for (const row of parsedRows) {
    lines.push(`${escapeCsvCell(row.article)};${String(row.cogs)}`)
  }
  return lines.join('\n')
}

export function buildOzonCogsMap(rawCsv: string): Map<string, number> | null {
  const parsedRows = parseOzonCogsRows(rawCsv)
  if (!parsedRows) return null

  const byArticle = new Map<string, { sum: number, count: number }>()
  for (const row of parsedRows) {
    const articleKey = normalizeArticleKey(row.article)
    const current = byArticle.get(articleKey) || { sum: 0, count: 0 }
    current.sum += row.cogs
    current.count += 1
    byArticle.set(articleKey, current)
  }

  const result = new Map<string, number>()
  for (const [article, stats] of byArticle.entries()) {
    if (stats.count === 0) continue
    result.set(article, stats.sum / stats.count)
  }
  return result
}

export function buildUnitArticleCogsMap(rawCsv: string): Map<string, number> | null {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), OZON_CSV_LAYOUT.delimiter)
  const headerIndex = findHeaderRowIndex(rows, [
    OZON_CSV_LAYOUT.unitHeaderFirstCell,
    OZON_UNIT_COLUMNS.article,
    OZON_UNIT_COLUMNS.cogs,
  ])
  if (headerIndex === -1) return null

  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))
  const articleIdx = colIndex.get(OZON_UNIT_COLUMNS.article)
  const unitCostIdx = colIndex.get(OZON_UNIT_COLUMNS.cogs)
  if (articleIdx === undefined || unitCostIdx === undefined) {
    return null
  }

  const dataRows = rows.slice(headerIndex + 1).filter((row) => normalize(row[0]) !== '')
  const byArticle = new Map<string, { sum: number, count: number }>()
  for (const row of dataRows) {
    const article = normalizeArticleKey(row[articleIdx] || '')
    const unitCost = parseNumber(row[unitCostIdx] || '')
    if (!article || unitCost === null) continue
    const current = byArticle.get(article) || { sum: 0, count: 0 }
    current.sum += unitCost
    current.count += 1
    byArticle.set(article, current)
  }

  const result = new Map<string, number>()
  for (const [article, stats] of byArticle.entries()) {
    if (stats.count === 0) continue
    result.set(article, stats.sum / stats.count)
  }
  return result
}

export function buildAccrualReports(
  rawCsv: string,
  vatRatePercent = 5,
  taxRatePercent = 6,
  cogsByArticleMap: Map<string, number> | null = null,
  articlePattern = '*',
  excludePattern = false,
): AccrualGroup[] {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), OZON_CSV_LAYOUT.delimiter)
  const headerIndex = findHeaderRowIndex(rows, [
    OZON_CSV_LAYOUT.accrualHeaderFirstCell,
    OZON_CSV_LAYOUT.accrualHeaderSecondCell,
    OZON_ACCRUAL_COLUMNS.amount,
    OZON_ACCRUAL_COLUMNS.serviceGroup,
  ])
  if (headerIndex === -1) {
    throw new Error('Не найдена строка заголовков отчета по начислениям.')
  }

  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))

  const allDataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => normalize(cell) !== ''))

  const getCell = (row: string[], colName: string): string => {
    const idx = colIndex.get(colName)
    if (idx === undefined) return ''
    return row[idx] || ''
  }

  const dataRows = allDataRows.filter((row) => isArticleIncludedByPattern(
    normalize(getCell(row, OZON_ACCRUAL_COLUMNS.article)),
    articlePattern,
    excludePattern,
  ))

  const accrualCogsFromUnitMap = (() => {
    if (!cogsByArticleMap || cogsByArticleMap.size === 0) return null
    if (
      !colIndex.has(OZON_ACCRUAL_COLUMNS.article)
      || !colIndex.has(OZON_ACCRUAL_COLUMNS.qty)
      || !colIndex.has(OZON_ACCRUAL_COLUMNS.accrualType)
    ) {
      return null
    }

    let total = 0
    let matchedRows = 0
    for (const row of dataRows) {
      const accrualType = normalize(getCell(row, OZON_ACCRUAL_COLUMNS.accrualType)).toLowerCase().replace(/ё/g, 'е')
      if (accrualType !== 'выручка') continue
      const articleKey = normalizeArticleKey(getCell(row, OZON_ACCRUAL_COLUMNS.article))
      const quantity = parseNumber(getCell(row, OZON_ACCRUAL_COLUMNS.qty))
      if (!articleKey || quantity === null) continue
      const unitCost = cogsByArticleMap.get(articleKey)
      if (unitCost === undefined) continue
      total += quantity * unitCost
      matchedRows += 1
    }
    return matchedRows > 0 ? total : null
  })()

  const sumByGroup = new Map<string, number>()
  const sumByDate = new Map<string, number>()
  const sumByScheme = new Map<string, number>()
  const groupTypeBreakdown = new Map<string, Map<string, number>>()

  let total = 0
  let salesQuantity = 0
  let cancellationsAndReturnsQuantity = 0
  let revenueWithoutSppSales = 0
  let revenueBeforeSppSales = 0
  let marketplaceExpenses = 0
  let returnsAmount = 0

  const addToMap = (map: Map<string, number>, key: string, value: number): void => {
    map.set(key, (map.get(key) || 0) + value)
  }

  const normalizeLower = (value: string): string => normalize(value).toLowerCase().replace(/ё/g, 'е')

  for (const row of dataRows) {
    const amount = parseNumber(getCell(row, OZON_ACCRUAL_COLUMNS.amount))
    if (amount === null) continue

    const group = normalize(getCell(row, OZON_ACCRUAL_COLUMNS.serviceGroup)) || 'Без группы'
    const type = normalize(getCell(row, OZON_ACCRUAL_COLUMNS.accrualType)) || 'Без типа'
    const date = normalizeAccrualDateLabel(getCell(row, OZON_ACCRUAL_COLUMNS.accrualDate)) || 'Без даты'
    const scheme = normalize(getCell(row, OZON_ACCRUAL_COLUMNS.scheme))

    total += amount

    const groupLower = normalizeLower(group)
    const typeLower = normalizeLower(type)
    const isReturnRow = groupLower.includes('возврат')
    const quantity = parseNumber(getCell(row, OZON_ACCRUAL_COLUMNS.qty))
    if (typeLower === 'выручка' && quantity !== null) {
      salesQuantity += quantity
    }
    if (groupLower === 'продажи' && typeLower === 'выручка') {
      revenueWithoutSppSales += amount
    }
    if (groupLower === 'продажи') {
      revenueBeforeSppSales += amount
    } else if (!isReturnRow) {
      marketplaceExpenses += amount
    }
    if (isReturnRow) {
      returnsAmount += amount
    }
    if (typeLower === 'обратная логистика' && quantity !== null) {
      cancellationsAndReturnsQuantity += quantity
    }
    addToMap(sumByGroup, group, amount)
    addToMap(sumByDate, date, amount)
    if (scheme) {
      addToMap(sumByScheme, scheme, amount)
    }

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

  const revenueByStore = revenueWithoutSppSales + returnsAmount
  const amountBeforeSpp = revenueBeforeSppSales + returnsAmount
  const salesBase = amountBeforeSpp > 0 ? amountBeforeSpp : null
  const sppAndPromotions = amountBeforeSpp - revenueByStore
  const totalTaxRate = (vatRatePercent + taxRatePercent) / 100
  const tax11 = amountBeforeSpp * totalTaxRate
  const cogsForNetProfit = accrualCogsFromUnitMap ?? 0
  const netProfit = total - tax11 - cogsForNetProfit
  const marginRate = revenueByStore !== 0 ? (netProfit / revenueByStore) * 100 : null
  const formatSalesShare = (value: number): string | null => {
    if (!salesBase) return null
    const sharePercent = (Math.abs(value) / salesBase) * 100
    const formattedShare = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(sharePercent)
    return `${formattedShare}%`
  }
  const classifyGroup = (rawLabel: string): { label: string, withSalesShare: boolean } => {
    const normalizedLabel = normalize(rawLabel).toLowerCase().replace(/ё/g, 'е')

    if (
      (normalizedLabel.includes('вознагражден') && normalizedLabel.includes('ozon'))
      || (normalizedLabel.includes('вознагражден') && normalizedLabel.includes('озон'))
    ) {
      return { label: 'Комиссия Ozon', withSalesShare: true }
    }
    if (normalizedLabel.includes('услуги доставки')) {
      return { label: 'Логистика', withSalesShare: true }
    }
    if (normalizedLabel.includes('возврат')) {
      return { label: 'Возвраты', withSalesShare: true }
    }
    if (normalizedLabel.includes('продвижен') && normalizedLabel.includes('реклам')) {
      return { label: 'Продвижение', withSalesShare: true }
    }
    if (normalizedLabel.includes('услуги фбо') || normalizedLabel.includes('fbo')) {
      return { label: 'Услуги ФБО', withSalesShare: true }
    }
    if (normalizedLabel.includes('услуги партнер')) {
      return { label: 'Услуги партнеров', withSalesShare: true }
    }
    if (normalizedLabel.includes('другие услуги') || normalizedLabel.includes('штраф')) {
      return { label: 'Другие услуги и штрафы', withSalesShare: true }
    }
    return { label: rawLabel, withSalesShare: false }
  }
  const groupedAccrualByLabel = new Map<string, { value: number, withSalesShare: boolean, sourceLabels: Set<string> }>()
  for (const [rawLabel, value] of sortByAbsDesc(Array.from(sumByGroup.entries()))) {
    const group = classifyGroup(rawLabel)
    const current = groupedAccrualByLabel.get(group.label) || {
      value: 0,
      withSalesShare: group.withSalesShare,
      sourceLabels: new Set<string>(),
    }
    current.value += value
    current.withSalesShare = current.withSalesShare || group.withSalesShare
    current.sourceLabels.add(rawLabel)
    groupedAccrualByLabel.set(group.label, current)
  }
  const groupMetrics = sortByAbsDesc(
    Array.from(groupedAccrualByLabel.entries()).map(([label, data]) => [label, data.value] as [string, number]),
  )
    .filter(([label]) => label !== SALES_GROUP_LABEL)
    .map(([label, value]) => {
    const data = groupedAccrualByLabel.get(label)!
    const labelsForFormula = Array.from(data.sourceLabels)
    const formula = labelsForFormula.length === 1
      ? `SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "${labelsForFormula[0]}"`
      : `SUM("Сумма итого, руб."), фильтр: "Группа услуг" IN (${labelsForFormula.map((item) => `"${item}"`).join(', ')})`
    return {
      label,
      value,
      type: 'currency' as const,
      formula,
      shareText: data.withSalesShare ? formatSalesShare(value) : null,
    }
  })
  groupMetrics.push({
    label: 'Итог',
    value: -Math.abs(marketplaceExpenses),
    type: 'currency',
    formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" != "Продажи" и исключая возвраты',
    shareText: salesBase ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format((Math.abs(marketplaceExpenses) / salesBase) * 100)}%` : null,
  })

  const groupSummaries: AccrualGroup[] = Array.from(groupTypeBreakdown.entries())
    .map(([group, types]) => {
      const topTypes = sortByAbsDesc(Array.from(types.entries())).slice(0, 3)
      const groupTotal = Array.from(types.values()).reduce((acc, value) => acc + value, 0)
      return {
        title: `Структура: ${group}`,
        metrics: toMetrics(
          topTypes,
          (label) => `SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "${group}" и "Тип начисления" = "${label}"`,
        ),
        total: groupTotal,
      }
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map(({ title, metrics }) => ({ title, metrics }))

  const accrualPeriodLabel = (() => {
    const timestamps = Array.from(sumByDate.keys())
      .map((label) => parseAccrualDateLabelToTimestamp(label))
      .filter((timestamp): timestamp is number => timestamp !== null)
      .sort((a, b) => a - b)
    if (timestamps.length === 0) return undefined
    const formatter = new Intl.DateTimeFormat('ru-RU')
    const from = formatter.format(new Date(timestamps[0]))
    const to = formatter.format(new Date(timestamps[timestamps.length - 1]))
    return from === to ? from : `${from} - ${to}`
  })()

  return [
    {
      title: 'Итоги периода',
      rowCount: dataRows.length,
      periodLabel: accrualPeriodLabel,
      metrics: [
        {
          label: 'Количество продаж',
          value: salesQuantity,
          type: 'number',
          formula: 'SUM("Количество"), фильтр: "Тип начисления" = "Выручка"',
        },
        {
          label: 'Отмены, возвраты, не выкупы',
          value: cancellationsAndReturnsQuantity,
          type: 'number',
          formula: 'SUM("Количество"), фильтр: "Тип начисления" = "Обратная логистика"',
        },
        {
          label: 'Выручка с учетом СПП',
          value: amountBeforeSpp,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "Продажи" + SUM возвратов',
        },
        {
          label: 'Выручка без СПП',
          value: revenueByStore,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "Продажи" и "Тип начисления" = "Выручка" + SUM возвратов',
        },
        {
          label: 'Возвраты',
          value: returnsAmount,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" содержит "возврат"',
        },
        {
          label: 'СПП и акции',
          value: sppAndPromotions,
          type: 'currency',
          formula: 'Выручка с учетом СПП - Выручка без СПП',
        },
        {
          label: 'Общие затраты по Маркетплейсу',
          value: marketplaceExpenses,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" != "Продажи" и исключая возвраты',
          shareText: salesBase ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format((Math.abs(marketplaceExpenses) / salesBase) * 100)}%` : null,
        },
        { label: 'Перевод в банк', value: total, type: 'currency', formula: 'SUM("Сумма итого, руб.") по всем строкам начислений' },
        {
          label: 'Себестоимость',
          value: accrualCogsFromUnitMap,
          type: 'currency',
          formula: 'Σ("Количество" * "Себестоимость артикула"), где "Тип начисления" = "Выручка", а себестоимость артикула берется из отчета "Юнит экономика" за тот же период',
        },
        {
          label: 'Налог',
          value: tax11,
          type: 'currency',
          formula: `(${vatRatePercent}% + ${taxRatePercent}%) * Выручка с учетом СПП`,
        },
        {
          label: 'Маржинальность',
          value: marginRate,
          type: 'percent',
          formula: 'Чистая прибыль / Выручка без СПП * 100%',
        },
        {
          label: 'Чистая прибыль',
          value: netProfit,
          type: 'currency',
          formula: 'Перевод в банк - Налог - Себестоимость',
        },
      ],
    },
    {
      title: GROUPED_EXPENSES_REPORT_TITLE,
      metrics: groupMetrics,
    },
    {
      title: 'Схема работы',
      metrics: toMetrics(
        sortByAbsDesc(Array.from(sumByScheme.entries())),
        (label) => `SUM("Сумма итого, руб."), фильтр: "Схема работы" = "${label}"`,
      ),
    },
    {
      title: 'Динамика по датам начисления',
      metrics: Array.from(sumByDate.entries())
        .sort(([a], [b]) => {
          const aTs = parseAccrualDateLabelToTimestamp(a)
          const bTs = parseAccrualDateLabelToTimestamp(b)
          if (aTs !== null && bTs !== null) return aTs - bTs
          if (aTs !== null) return -1
          if (bTs !== null) return 1
          return a.localeCompare(b, 'ru')
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
