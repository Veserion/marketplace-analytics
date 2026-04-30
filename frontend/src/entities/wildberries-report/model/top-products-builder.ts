import { WB_BASE_COLUMNS, WB_CSV_LAYOUT, WB_QUANTITY_COLUMNS, WB_REVENUE_COLUMNS } from '@/entities/wildberries-report/model/columns'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'
import type { CsvTable } from '@/shared/lib/reporting'
import { assertCsvColumns, createCsvTable, isArticleIncludedByPattern, normalizeLower, stripBom } from '@/shared/lib/reporting'
import type { CogsByArticleMap, CogsMatchingMode } from '@/entities/wildberries-report/model/cogs-builder'
import { resolveCogsLookupKey } from '@/entities/wildberries-report/model/cogs-builder'

type SalesShareLevel = 'risk' | 'warning' | 'normal' | 'super'
export type WildberriesTopProductItem = {
  article: string
  nomenclatureCode: string | null
  salesCount: number
  revenueAmount: number
  revenueSharePercent: number
  cogsAmount: number | null
  salesSharePercent: number
  cumulativeSalesSharePercent: number
  salesShareLevel: SalesShareLevel
}

function resolveSalesShareLevel(cumulativeSharePercent: number): SalesShareLevel {
  if (cumulativeSharePercent <= 50) return 'super'
  if (cumulativeSharePercent <= 80) return 'normal'
  if (cumulativeSharePercent <= 95) return 'warning'
  return 'risk'
}

type WildberriesTopProductAggregate = {
  salesCount: number
  revenue: number
  cogsTotal: number
  hasCogs: boolean
  nomenclatureCode: string | null
}

function aggregateWildberriesTopProducts(
  table: CsvTable,
  articlePattern: string,
  cogsByArticleMap: CogsByArticleMap | null,
  cogsMatchingMode: CogsMatchingMode,
  excludePattern: boolean,
): Map<string, WildberriesTopProductAggregate> {
  const byArticle = new Map<string, WildberriesTopProductAggregate>()
  for (const row of table.dataRows) {
    const article = normalize(table.getCell(row, WB_BASE_COLUMNS.article))
    if (!article || !isArticleIncludedByPattern(article, articlePattern, excludePattern)) continue

    const reasonLower = normalizeLower(table.getCell(row, WB_BASE_COLUMNS.reason))
    if (reasonLower !== 'продажа') continue

    const quantity = parseNumber(table.getCell(row, WB_QUANTITY_COLUMNS.qty)) ?? 0
    const revenue = parseNumber(table.getCell(row, WB_REVENUE_COLUMNS.retailPrice)) ?? 0
    const nomenclatureCode = normalize(table.getCell(row, WB_BASE_COLUMNS.nomenclatureCode)) || null

    const current = byArticle.get(article) || {
      salesCount: 0,
      revenue: 0,
      cogsTotal: 0,
      hasCogs: false,
      nomenclatureCode: null,
    }
    current.salesCount += quantity
    current.revenue += revenue
    if (!current.nomenclatureCode && nomenclatureCode) {
      current.nomenclatureCode = nomenclatureCode
    }

    if (cogsByArticleMap && cogsByArticleMap.size > 0) {
      const cogsLookupKey = resolveCogsLookupKey(article, cogsMatchingMode)
      const unitCogs = cogsByArticleMap.get(cogsLookupKey)
      if (unitCogs !== undefined) {
        current.cogsTotal += unitCogs * quantity
        current.hasCogs = true
      }
    }

    byArticle.set(article, current)
  }
  return byArticle
}

function rankWildberriesTopProducts(
  byArticle: Map<string, WildberriesTopProductAggregate>,
): WildberriesTopProductItem[] {
  const sortedProducts = Array.from(byArticle.entries())
    .map(([article, stats]) => ({
      article,
      nomenclatureCode: stats.nomenclatureCode,
      salesCount: stats.salesCount,
      revenueAmount: stats.revenue,
      cogsAmount: stats.hasCogs ? stats.cogsTotal : null,
    }))
    .sort((a, b) => (
      b.salesCount - a.salesCount
      || (b.revenueAmount - a.revenueAmount)
      || a.article.localeCompare(b.article, 'ru')
    ))

  const totalSalesCount = sortedProducts.reduce((acc, item) => acc + item.salesCount, 0)
  const totalRevenueAmount = sortedProducts.reduce((acc, item) => acc + item.revenueAmount, 0)
  let cumulativeSharePercent = 0

  const productsWithShare = sortedProducts.map((item) => {
    const salesSharePercent = totalSalesCount > 0 ? (item.salesCount / totalSalesCount) * 100 : 0
    const revenueSharePercent = totalRevenueAmount > 0 ? (item.revenueAmount / totalRevenueAmount) * 100 : 0
    cumulativeSharePercent += salesSharePercent
    return {
      ...item,
      revenueSharePercent,
      salesSharePercent,
      cumulativeSalesSharePercent: cumulativeSharePercent,
      salesShareLevel: resolveSalesShareLevel(cumulativeSharePercent),
    }
  })

  return productsWithShare
}

export function buildWildberriesTopProducts(
  rawCsv: string,
  articlePattern = '*',
  cogsByArticleMap: CogsByArticleMap | null = null,
  cogsMatchingMode: CogsMatchingMode = 'full',
  excludePattern = false,
): WildberriesTopProductItem[] {
  const rows = parseCsv(stripBom(rawCsv), WB_CSV_LAYOUT.delimiter)
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === WB_CSV_LAYOUT.headerFirstCell
      && normalize(row[1]) === WB_CSV_LAYOUT.headerSecondCell,
  )
  if (headerIndex === -1) return []

  const table = createCsvTable(rows, headerIndex)
  assertCsvColumns(table, [
    WB_BASE_COLUMNS.article,
    WB_BASE_COLUMNS.reason,
    WB_QUANTITY_COLUMNS.qty,
    WB_REVENUE_COLUMNS.retailPrice,
  ], 'топа товаров Wildberries')
  const aggregate = aggregateWildberriesTopProducts(
    table,
    articlePattern,
    cogsByArticleMap,
    cogsMatchingMode,
    excludePattern,
  )

  return rankWildberriesTopProducts(aggregate)
}
