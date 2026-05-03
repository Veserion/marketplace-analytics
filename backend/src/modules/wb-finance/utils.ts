import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Wildberries financial weeks run from Monday to Sunday.
 * This function calculates the start and end of the week for a given date.
 */
export function getWeekPeriod(date: Date): { from: Date; to: Date } {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  
  return { from: monday, to: sunday }
}

/**
 * Get all weekly periods that intersect with the user's requested period.
 */
export function getRequiredWbWeeklyPeriods(periodFrom: Date, periodTo: Date): Array<{ from: Date; to: Date }> {
  const weeks: Array<{ from: Date; to: Date }> = []
  
  let currentWeek = getWeekPeriod(periodFrom)
  
  while (currentWeek.from <= periodTo) {
    weeks.push({ from: new Date(currentWeek.from), to: new Date(currentWeek.to) })
    
    // Move to next week
    currentWeek.from.setDate(currentWeek.from.getDate() + 7)
    currentWeek.to.setDate(currentWeek.to.getDate() + 7)
  }
  
  return weeks
}

/**
 * Get the last closed week (the week that ended before today).
 * WB reports are typically available the day after the week ends (Monday).
 */
export function getLastClosedWeek(): { from: Date; to: Date } | null {
  const now = new Date()
  const day = now.getDay()
  
  // If today is Monday, last closed week ended yesterday (Sunday)
  // Otherwise, last closed week ended on the most recent Sunday
  let daysToSunday = day === 0 ? 0 : day
  const lastSunday = new Date(now)
  lastSunday.setDate(now.getDate() - daysToSunday)
  lastSunday.setHours(23, 59, 59, 999)
  
  const weekPeriod = getWeekPeriod(lastSunday)
  
  // If today is Monday, the week ending yesterday should be available
  // If today is Tuesday-Sunday, the week ending last Sunday should be available
  return weekPeriod
}

/**
 * Calculate SHA256 hash of a string or buffer.
 */
export function calculateFileHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Ensure a directory exists, create if it doesn't.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath)
  } catch {
    await fs.mkdir(dirPath, { recursive: true })
  }
}

/**
 * Save JSON data to a file.
 */
export async function saveJsonFile(filePath: string, data: unknown): Promise<{ size: number; hash: string }> {
  const content = JSON.stringify(data, null, 2)
  const buffer = Buffer.from(content, 'utf-8')
  
  const dir = path.dirname(filePath)
  await ensureDir(dir)
  
  await fs.writeFile(filePath, buffer)
  
  const size = buffer.length
  const hash = calculateFileHash(buffer)
  
  return { size, hash }
}

/**
 * Read JSON data from a file.
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(content) as T
}

/**
 * Deduplicate rows based on rrdId, srid, or a composite key.
 */
export function dedupeRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  const seen = new Set<string>()
  const deduped: T[] = []
  
  for (const row of rows) {
    let key: string
    
    if (row.rrdId && typeof row.rrdId === 'number') {
      key = `rrdId:${row.rrdId}`
    } else if (row.srid && typeof row.srid === 'string') {
      key = `srid:${row.srid}`
    } else if (row.srid && row.docTypeName && row.forPay && row.rrDate) {
      key = `${row.srid}_${row.docTypeName}_${row.forPay}_${row.rrDate}`
    } else {
      // Fallback: use the whole row as key
      key = JSON.stringify(row)
    }
    
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(row)
    }
  }
  
  return deduped
}

/**
 * Pick only specified fields from an object.
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }
  return result
}

/**
 * Default fields to request from WB API.
 */
export const WB_DEFAULT_FIELDS = [
  'rrdId',
  'docTypeName',
  'sellerOperName',
  'nmId',
  'vendorCode',
  'sku',
  'title',
  'subjectName',
  'brandName',
  'orderDt',
  'saleDt',
  'rrDate',
  'deliveryMethod',
  'officeName',
  'bonusTypeName',
  'quantity',
  'returnAmount',
  'deliveryAmount',
  'retailPrice',
  'retailPriceWithDisc',
  'retailAmount',
  'sellerRealized',
  'commissionPercent',
  'forPay',
  'deliveryService',
  'vw',
  'acquiringFee',
  'ppvzReward',
  'rebillLogisticCost',
  'paidStorage',
  'deduction',
  'paidAcceptance',
  'penalty',
  'additionalPayment',
  'cashbackAmount',
  'cashbackDiscount',
  'cashbackCommissionChange',
  'srid',
  'orderUid',
] as const

/**
 * Generate file name for a weekly report.
 */
export function generateReportFileName(periodFrom: Date, periodTo: Date): string {
  const formatDate = (d: Date) => d.toISOString().split('T')[0]
  return `wb-weekly-report_${formatDate(periodFrom)}_${formatDate(periodTo)}.json`
}

/**
 * Generate file path for a weekly report.
 */
export function generateReportFilePath(companyId: string, reportId: string): string {
  return `/${companyId}/${reportId}.json`
}
