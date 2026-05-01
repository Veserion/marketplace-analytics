import { normalize, parseCsv } from '@/shared/lib/csv'
import { createCsvTable, findHeaderRowIndex } from '@/shared/lib/reporting'
import { WB_BASE_COLUMNS, WB_CSV_LAYOUT, WB_EXPENSE_COLUMNS, WB_REVENUE_COLUMNS } from './columns'

const WB_WEEKLY_REQUIRED_COLUMNS = [
  WB_BASE_COLUMNS.documentType,
  WB_REVENUE_COLUMNS.payout,
  WB_REVENUE_COLUMNS.retailPriceWithDiscount,
  WB_EXPENSE_COLUMNS.wbCommissionRate,
  WB_EXPENSE_COLUMNS.paymentServices,
  WB_EXPENSE_COLUMNS.logisticsToBuyer,
] as const

function toDateTimestamp(label: string): number | null {
  const normalized = normalize(label)
  if (!normalized) return null

  const dotParts = normalized.split('.').map(Number)
  if (dotParts.length === 3 && dotParts.every((part) => !Number.isNaN(part))) {
    const [day, month, year] = dotParts
    const date = new Date(year, month - 1, day)
    return Number.isNaN(date.getTime()) ? null : date.getTime()
  }

  const dashParts = normalized.split('-').map(Number)
  if (dashParts.length === 3 && dashParts.every((part) => !Number.isNaN(part))) {
    const [year, month, day] = dashParts
    const date = new Date(year, month - 1, day)
    return Number.isNaN(date.getTime()) ? null : date.getTime()
  }

  const parsed = Date.parse(normalized)
  if (!Number.isNaN(parsed)) return parsed

  return null
}

function stripBom(value: string): string {
  return value.startsWith('\uFEFF') ? value.slice(1) : value
}

export type WbPeriod = {
  periodStart: string | null
  periodEnd: string | null
}

/**
 * Извлекает период из CSV еженедельного отчёта WB по колонке "Дата продажи".
 * Возвращает форматированные даты DD.MM.YYYY или null, если период определить не удалось.
 */
export function extractWildberriesPeriodFromCsv(csvText: string): WbPeriod {
  try {
    const rows = parseCsv(stripBom(csvText), WB_CSV_LAYOUT.delimiter)
    const headerIndex = rows.findIndex(
      (row) => normalize(row[0]) === WB_CSV_LAYOUT.headerFirstCell
        && normalize(row[1]) === WB_CSV_LAYOUT.headerSecondCell,
    )
    if (headerIndex === -1) return { periodStart: null, periodEnd: null }

    const table = createCsvTable(rows, headerIndex)
    const dateStrings = table.dataRows
      .map((row) => normalize(table.getCell(row, WB_BASE_COLUMNS.salesDate)))
      .filter(Boolean)

    const timestamps = dateStrings
      .map((label) => toDateTimestamp(label))
      .filter((ts): ts is number => ts !== null)
      .sort((a, b) => a - b)

    if (timestamps.length === 0) return { periodStart: null, periodEnd: null }

    const formatter = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

    return {
      periodStart: formatter.format(new Date(timestamps[0])),
      periodEnd: formatter.format(new Date(timestamps[timestamps.length - 1])),
    }
  } catch {
    return { periodStart: null, periodEnd: null }
  }
}

/**
 * Проверяет, что CSV содержит обязательные колонки еженедельного детализированного отчёта WB.
 * Возвращает список недостающих колонок (пустой массив = валидный файл).
 */
export function validateWildberriesWeeklyColumns(csvText: string): string[] {
  try {
    const rows = parseCsv(stripBom(csvText), WB_CSV_LAYOUT.delimiter)
    const headerIndex = findHeaderRowIndex(
      rows,
      [WB_CSV_LAYOUT.headerFirstCell, WB_CSV_LAYOUT.headerSecondCell],
    )
    if (headerIndex === -1) {
      return ['Строка заголовков не найдена']
    }

    const table = createCsvTable(rows, headerIndex)
    return WB_WEEKLY_REQUIRED_COLUMNS.filter((col) => !table.colIndex.has(col))
  } catch {
    return ['Не удалось прочитать файл']
  }
}

export const WB_WEEKLY_SLOTS = ['wildberriesWeekly1', 'wildberriesWeekly2', 'wildberriesWeekly3', 'wildberriesWeekly4', 'wildberriesWeekly5', 'wildberriesWeekly6', 'wildberriesWeekly7', 'wildberriesWeekly8'] as const
export type WbWeeklySlot = typeof WB_WEEKLY_SLOTS[number]
export const MAX_WEEKLY_REPORTS = 8
