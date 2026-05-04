import { OZON_ACCRUAL_COLUMNS, OZON_CSV_LAYOUT, OZON_UNIT_COLUMNS } from '@/entities/ozon-report/model/columns'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'
import { assertCsvColumns, averageByKey, createCsvTable, findHeaderRowIndex, isArticleIncludedByPattern, normalizeArticleKey, parseCsvWithFallback, rowsToSemicolonCsv, stripBom } from '@/shared/lib/reporting'

export type CogsMatchingMode = 'full' | 'digits'

function extractDigitsPattern(article: string): string {
  return normalizeArticleKey(article).replace(/\D/g, '')
}

export function resolveCogsLookupKey(article: string, mode: CogsMatchingMode): string {
  const normalizedArticle = normalizeArticleKey(article)
  if (mode === 'digits') {
    const digitsPattern = extractDigitsPattern(normalizedArticle)
    if (digitsPattern) return `digits:${digitsPattern}`
  }
  return `full:${normalizedArticle}`
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
  const rows = parseCsvWithFallback(rawCsv, OZON_CSV_LAYOUT.delimiter, ',')
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

export function extractOzonCogsCsv(rawCsv: string): string | null {
  const parsedRows = parseOzonCogsRows(rawCsv)
  if (!parsedRows) return null

  return rowsToSemicolonCsv([
    [OZON_UNIT_COLUMNS.article, OZON_UNIT_COLUMNS.cogs],
    ...parsedRows.map((row) => [row.article, row.cogs]),
  ])
}

export function buildOzonCogsMap(rawCsv: string, mode: CogsMatchingMode = 'full'): Map<string, number> | null {
  const parsedRows = parseOzonCogsRows(rawCsv)
  if (!parsedRows) return null

  return averageByKey(parsedRows, (row) => resolveCogsLookupKey(row.article, mode), (row) => row.cogs)
}

export function buildUnitArticleCogsMap(rawCsv: string): Map<string, number> | null {
  const rows = parseCsv(stripBom(rawCsv), OZON_CSV_LAYOUT.delimiter)
  const headerIndex = findHeaderRowIndex(rows, [
    OZON_CSV_LAYOUT.unitHeaderFirstCell,
    OZON_UNIT_COLUMNS.article,
    OZON_UNIT_COLUMNS.cogs,
  ])
  if (headerIndex === -1) return null

  const table = createCsvTable(rows, headerIndex, (row) => normalize(row[0]) !== '')
  const articleIdx = table.colIndex.get(OZON_UNIT_COLUMNS.article)
  const unitCostIdx = table.colIndex.get(OZON_UNIT_COLUMNS.cogs)
  if (articleIdx === undefined || unitCostIdx === undefined) {
    return null
  }

  const cogsRows: CogsRow[] = []
  for (const row of table.dataRows) {
    const article = normalizeArticleKey(row[articleIdx] || '')
    const unitCost = parseNumber(row[unitCostIdx] || '')
    if (!article || unitCost === null) continue
    cogsRows.push({ article, cogs: unitCost })
  }

  return averageByKey(cogsRows, (row) => row.article, (row) => row.cogs)
}

export function getOzonMissingCogsArticles(
  accrualCsv: string,
  cogsByArticleMap: Map<string, number> | null,
  articlePattern = '*',
  excludePattern = false,
  cogsMatchingMode: CogsMatchingMode = 'full',
): string[] {
  if (!cogsByArticleMap || cogsByArticleMap.size === 0) return []

  const rows = parseCsv(stripBom(accrualCsv), OZON_CSV_LAYOUT.delimiter)
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === OZON_CSV_LAYOUT.accrualHeaderFirstCell
      && normalize(row[1]) === OZON_CSV_LAYOUT.accrualHeaderSecondCell,
  )
  if (headerIndex === -1) return []

  const table = createCsvTable(rows, headerIndex)
  assertCsvColumns(table, [OZON_ACCRUAL_COLUMNS.article], 'отчета по начислениям Ozon')
  const articleIdx = table.colIndex.get(OZON_ACCRUAL_COLUMNS.article)
  if (articleIdx === undefined) return []

  const missingByKey = new Map<string, string>()
  for (const row of table.dataRows) {
    const article = normalize(row[articleIdx] || '')
    if (!article) continue
    if (!isArticleIncludedByPattern(article, articlePattern, excludePattern)) continue

    const articleKey = resolveCogsLookupKey(article, cogsMatchingMode)
    if (cogsByArticleMap.has(articleKey)) continue
    if (!missingByKey.has(articleKey)) {
      missingByKey.set(articleKey, article)
    }
  }

  return Array.from(missingByKey.values()).sort((a, b) => a.localeCompare(b, 'ru'))
}
