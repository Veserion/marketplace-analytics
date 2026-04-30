import { WB_BASE_COLUMNS, WB_COGS_COLUMNS, WB_CSV_LAYOUT } from '@/entities/wildberries-report/model/columns'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'
import { assertCsvColumns, averageByKey, createCsvTable, isArticleIncludedByPattern, normalizeArticleKey, normalizeLower, parseCsvWithFallback, rowsToSemicolonCsv, stripBom } from '@/shared/lib/reporting'

export type CogsByArticleMap = Map<string, number>
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
  const normalizedHeaders = headers.map((header) => normalizeLower(header))
  const articleIdx = normalizedHeaders.findIndex(
    (header) => header === normalizeLower(WB_COGS_COLUMNS.article),
  )
  if (articleIdx === -1) return null

  const cogsIdx = normalizedHeaders.findIndex(
    (header) => header === normalizeLower(WB_COGS_COLUMNS.cogs),
  )
  if (cogsIdx === -1) return null

  return { articleIdx, cogsIdx }
}

type CogsRow = {
  article: string
  cogs: number
}

function parseWildberriesCogsRows(rawCsv: string): CogsRow[] | null {
  const rows = parseCsvWithFallback(rawCsv, WB_CSV_LAYOUT.delimiter, WB_CSV_LAYOUT.cogsFallbackDelimiter)
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

export function extractWildberriesCogsCsv(rawCsv: string): string | null {
  const parsedRows = parseWildberriesCogsRows(rawCsv)
  if (!parsedRows) return null

  return rowsToSemicolonCsv([
    [WB_COGS_COLUMNS.article, WB_COGS_COLUMNS.cogs],
    ...parsedRows.map((row) => [row.article, row.cogs]),
  ])
}

export function buildWildberriesCogsMap(
  rawCsv: string,
  mode: CogsMatchingMode = 'full',
): CogsByArticleMap | null {
  const parsedRows = parseWildberriesCogsRows(rawCsv)
  if (!parsedRows) return null

  return averageByKey(parsedRows, (row) => resolveCogsLookupKey(row.article, mode), (row) => row.cogs)
}

export function getWildberriesMissingCogsArticles(
  rawCsv: string,
  cogsByArticleMap: CogsByArticleMap | null,
  articlePattern = '*',
  cogsMatchingMode: CogsMatchingMode = 'full',
  excludePattern = false,
): string[] {
  if (!cogsByArticleMap || cogsByArticleMap.size === 0) return []

  const rows = parseCsv(stripBom(rawCsv), WB_CSV_LAYOUT.delimiter)
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === WB_CSV_LAYOUT.headerFirstCell
      && normalize(row[1]) === WB_CSV_LAYOUT.headerSecondCell,
  )
  if (headerIndex === -1) return []

  const table = createCsvTable(rows, headerIndex)
  assertCsvColumns(table, [WB_BASE_COLUMNS.article], 'еженедельного отчета Wildberries')
  const articleIdx = table.colIndex.get(WB_BASE_COLUMNS.article)
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
