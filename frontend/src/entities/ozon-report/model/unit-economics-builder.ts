import { AD_COLS, LOGISTICS_COLS, METRICS, OTHER_EXPENSE_COLS, REVERSE_LOGISTICS_COLS } from '@/entities/ozon-report/config/metrics'
import { OZON_CSV_LAYOUT, OZON_UNIT_COLUMNS } from '@/entities/ozon-report/model/columns'
import type { AvailabilityGroups, ProductMarginItem, ReportGroup } from '@/entities/ozon-report/model/types'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'
import { assertCsvColumns, createCsvTable, findHeaderRowIndex, isArticleIncludedByPattern, stripBom } from '@/shared/lib/reporting'

type OzonUnitMetricValues = Record<(typeof METRICS)[number]['key'], number | null>

type OzonUnitAggregate = {
  rowCount: number
  values: OzonUnitMetricValues
  availabilityGroups: AvailabilityGroups
  productMargins: ProductMarginItem[]
}

function sumOzonUnitColumn(
  rowsSubset: string[][],
  headerSet: Set<string>,
  getCell: (row: string[], colName: string) => string,
  name: string,
): number | null {
  if (!headerSet.has(name)) return null
  let sum = 0
  for (const row of rowsSubset) {
    const n = parseNumber(getCell(row, name))
    if (n !== null) sum += n
  }
  return sum
}

function sumDefinedOzonUnitColumns(
  rowsSubset: string[][],
  headerSet: Set<string>,
  getCell: (row: string[], colName: string) => string,
  names: string[],
): number | null {
  const values = names
    .map((name) => sumOzonUnitColumn(rowsSubset, headerSet, getCell, name))
    .filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return values.reduce((acc, value) => acc + value, 0)
}

function calculateOzonUnitCogs(
  rowsSubset: string[][],
  getCell: (row: string[], colName: string) => string,
): number {
  return rowsSubset.reduce((acc, row) => {
    const unitCost = parseNumber(getCell(row, OZON_UNIT_COLUMNS.cogs))
    const d = parseNumber(getCell(row, OZON_UNIT_COLUMNS.deliveredQty))
    const r = parseNumber(getCell(row, OZON_UNIT_COLUMNS.returnedQty))
    if (unitCost === null || d === null || r === null) return acc
    return acc + unitCost * (d - r)
  }, 0)
}

function buildOzonAvailabilityGroups(
  rowsSubset: string[][],
  headerSet: Set<string>,
  getCell: (row: string[], colName: string) => string,
): AvailabilityGroups {
  const availabilityGroups: AvailabilityGroups = {
    urgent: [],
    maintain: [],
    enough: [],
  }

  if (!headerSet.has(OZON_UNIT_COLUMNS.article) || !headerSet.has(OZON_UNIT_COLUMNS.availability)) {
    return availabilityGroups
  }

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
  return {
    urgent: sortArticles(urgent),
    maintain: sortArticles(maintain),
    enough: sortArticles(enough),
  }
}

function buildOzonProductMargins(
  rowsSubset: string[][],
  headerSet: Set<string>,
  getCell: (row: string[], colName: string) => string,
): ProductMarginItem[] {
  if (!headerSet.has(OZON_UNIT_COLUMNS.article) || !headerSet.has(OZON_UNIT_COLUMNS.salesShare)) {
    return []
  }

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

  const productMargins: ProductMarginItem[] = []
  for (const [article, stats] of marginByArticle.entries()) {
    productMargins.push({
      article,
      marginSharePercent: stats.marginSum / stats.marginCount,
      profitPerUnit: stats.profitCount > 0 ? stats.profitSum / stats.profitCount : null,
    })
  }
  return productMargins
}

function aggregateOzonUnitRows(
  rowsSubset: string[][],
  headers: string[],
  getCell: (row: string[], colName: string) => string,
  vatRatePercent: number,
  taxRatePercent: number,
): OzonUnitAggregate {
  const headerSet = new Set(headers)
  const sumCol = (name: string): number | null => sumOzonUnitColumn(rowsSubset, headerSet, getCell, name)

  const sales = sumCol(OZON_UNIT_COLUMNS.orderedQty)
  const delivered = sumCol(OZON_UNIT_COLUMNS.deliveredQty)
  const returns = sumCol(OZON_UNIT_COLUMNS.returnedQty)
  const revenue = sumCol(OZON_UNIT_COLUMNS.revenue)
  const accruedPoints = sumCol(OZON_UNIT_COLUMNS.pointsPrimary) ?? sumCol(OZON_UNIT_COLUMNS.pointsAlt)
  const partnerCompensation = sumCol(OZON_UNIT_COLUMNS.partnerProgramsPrimary) ?? sumCol(OZON_UNIT_COLUMNS.partnerProgramsAlt)
  const commission = sumCol(OZON_UNIT_COLUMNS.commissionPrimary) ?? sumCol(OZON_UNIT_COLUMNS.commissionAlt)
  const sumDefinedCols = (names: string[]): number | null => sumDefinedOzonUnitColumns(rowsSubset, headerSet, getCell, names)

  const logistics = sumDefinedCols(LOGISTICS_COLS)
  const reverseLogistics = sumDefinedCols(REVERSE_LOGISTICS_COLS)
  const acquiring = sumCol(OZON_UNIT_COLUMNS.acquiring)
  const periodProfit = sumCol(OZON_UNIT_COLUMNS.periodProfit)

  const hasAdsCols = AD_COLS.every((col) => headerSet.has(col))
  const adsCost = hasAdsCols ? AD_COLS.reduce((acc, col) => acc + (sumCol(col) || 0), 0) : null

  const otherExpenses = sumDefinedCols(OTHER_EXPENSE_COLS)
  const cogs = calculateOzonUnitCogs(rowsSubset, getCell)

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

  return {
    rowCount: rowsSubset.length,
    values: {
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
    },
    availabilityGroups: buildOzonAvailabilityGroups(rowsSubset, headerSet, getCell),
    productMargins: buildOzonProductMargins(rowsSubset, headerSet, getCell),
  }
}

function buildOzonUnitMetrics(
  values: OzonUnitMetricValues,
  vatRatePercent: number,
  taxRatePercent: number,
): ReportGroup['metrics'] {
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
  return metrics
}

function buildUnitEconomicsReport(
  rowsSubset: string[][],
  headers: string[],
  getCell: (row: string[], colName: string) => string,
  vatRatePercent: number,
  taxRatePercent: number,
  title: string,
): ReportGroup {
  const aggregate = aggregateOzonUnitRows(rowsSubset, headers, getCell, vatRatePercent, taxRatePercent)
  return {
    title,
    rowCount: aggregate.rowCount,
    metrics: buildOzonUnitMetrics(aggregate.values, vatRatePercent, taxRatePercent),
    availabilityGroups: aggregate.availabilityGroups,
    productMargins: aggregate.productMargins,
  }
}

export function buildUnitEconomicsReports(
  rawCsv: string,
  articlePattern: string,
  vatRatePercent: number,
  taxRatePercent: number,
  excludePattern = false,
): ReportGroup[] {
  const rows = parseCsv(stripBom(rawCsv), OZON_CSV_LAYOUT.delimiter)
  const headerIndex = findHeaderRowIndex(rows, [
    OZON_CSV_LAYOUT.unitHeaderFirstCell,
    OZON_UNIT_COLUMNS.article,
    OZON_UNIT_COLUMNS.revenue,
  ])
  if (headerIndex === -1) {
    throw new Error(`Не найдена строка заголовков с колонкой ${OZON_CSV_LAYOUT.unitHeaderFirstCell}.`)
  }

  const table = createCsvTable(rows, headerIndex, (row) => normalize(row[0]) !== '')
  assertCsvColumns(table, [
    OZON_UNIT_COLUMNS.article,
    OZON_UNIT_COLUMNS.orderedQty,
    OZON_UNIT_COLUMNS.deliveredQty,
    OZON_UNIT_COLUMNS.returnedQty,
    OZON_UNIT_COLUMNS.revenue,
  ], 'юнит-экономики Ozon')

  const matchedRows = table.dataRows.filter((row) => isArticleIncludedByPattern(
    normalize(table.getCell(row, OZON_UNIT_COLUMNS.article)),
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
      table.headers,
      table.getCell,
      vatRatePercent,
      taxRatePercent,
      reportTitle,
    ),
  ]
}
