import { normalize, parseCsv } from '@/shared/lib/csv'

export type CsvTable = {
  headers: string[]
  colIndex: Map<string, number>
  dataRows: string[][]
  getCell: (row: string[], colName: string) => string
}

export function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '')
}

export function parseCsvWithFallback(
  rawCsv: string,
  delimiter = ';',
  fallbackDelimiter = ',',
): string[][] {
  const normalized = stripBom(rawCsv)
  const primaryRows = parseCsv(normalized, delimiter)
  if (primaryRows.some((row) => row.length > 1)) return primaryRows
  return parseCsv(normalized, fallbackDelimiter)
}

export function escapeCsvCell(value: string): string {
  if (!/[;"\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

export function rowsToSemicolonCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(';'))
    .join('\n')
}

export function normalizeLower(value: string): string {
  return normalize(value).toLowerCase().replace(/ё/g, 'е')
}

export function normalizeArticleKey(article: string): string {
  return normalize(article).toLowerCase()
}

export function hasHeaderCell(row: string[], headerName: string): boolean {
  return row.some((cell) => normalize(cell) === headerName)
}

export function findHeaderRowIndex(rows: string[][], requiredHeaders: string[]): number {
  return rows.findIndex((row) => requiredHeaders.every((header) => hasHeaderCell(row, header)))
}

export function createCsvTable(
  rows: string[][],
  headerIndex: number,
  isDataRow: (row: string[]) => boolean = (row) => row.some((cell) => normalize(cell) !== ''),
): CsvTable {
  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))
  const dataRows = rows.slice(headerIndex + 1).filter(isDataRow)

  return {
    headers,
    colIndex,
    dataRows,
    getCell: (row: string[], colName: string): string => {
      const idx = colIndex.get(colName)
      if (idx === undefined) return ''
      return row[idx] || ''
    },
  }
}

export function assertCsvColumns(table: CsvTable, requiredColumns: string[], sourceLabel: string): void {
  const missingColumns = requiredColumns.filter((column) => !table.colIndex.has(column))
  if (missingColumns.length === 0) return
  throw new Error(`Некорректный CSV ${sourceLabel}: не найдены обязательные колонки: ${missingColumns.join(', ')}.`)
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

export function matchesArticlePattern(article: string, pattern: string): boolean {
  const regex = patternToRegex(pattern)
  if (!regex) return true
  return regex.test(article)
}

export function isArticleIncludedByPattern(article: string, pattern: string, excludePattern: boolean): boolean {
  const isMatched = matchesArticlePattern(article, pattern)
  return excludePattern ? !isMatched : isMatched
}

export function addToNumberMap<K>(map: Map<K, number>, key: K, value: number): void {
  map.set(key, (map.get(key) || 0) + value)
}

export function sumNumberMap<K>(map: Map<K, number>): number {
  let total = 0
  for (const value of map.values()) total += value
  return total
}

export function sortByAbsDesc(entries: [string, number][]): [string, number][] {
  return entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
}

export function formatSharePercent(value: number, base: number | null): string | null {
  if (!base) return null
  const sharePercent = (Math.abs(value) / base) * 100
  const formattedShare = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(sharePercent)
  return `${formattedShare}%`
}

export function averageByKey<K, T>(
  rows: T[],
  getKey: (row: T) => K,
  getValue: (row: T) => number,
): Map<K, number> {
  const grouped = new Map<K, { sum: number, count: number }>()
  for (const row of rows) {
    const key = getKey(row)
    const current = grouped.get(key) || { sum: 0, count: 0 }
    current.sum += getValue(row)
    current.count += 1
    grouped.set(key, current)
  }

  const result = new Map<K, number>()
  for (const [key, stats] of grouped.entries()) {
    if (stats.count === 0) continue
    result.set(key, stats.sum / stats.count)
  }
  return result
}
