import type { AccrualGroup, AccrualMetric, ValueType } from '@/entities/ozon-report/model/types'
import {
  WB_BASE_COLUMNS,
  WB_COGS_COLUMNS,
  WB_CSV_LAYOUT,
  WB_EXPENSE_COLUMNS,
  WB_LOYALTY_COLUMNS,
  WB_QUANTITY_COLUMNS,
  WB_REVENUE_COLUMNS,
} from '@/entities/wildberries-report/model/columns'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'

type WbRow = {
  article: string
  documentType: string
  reason: string
  salesDate: string
  salesMethod: string
  warehouse: string
  basketId: string
  srid: string
  logisticsKind: string
  quantity: number
  returnCount: number
  deliveryCount: number
  retailPrice: number
  retailPriceWithDiscount: number
  sellerRealized: number
  payout: number
  logisticsCost: number
  wbCommission: number
  paymentServicesCommission: number
  pvzCompensation: number
  transportReimbursement: number
  storageCost: number
  withholdings: number
  acceptanceOperations: number
  fines: number
  vvCorrection: number
  loyaltyCompensation: number
  loyaltyProgramCost: number
  loyaltyPointsWithheld: number
}

type ClassifiedGroup = {
  label: string
  withSalesShare: boolean
}

type CogsByArticleMap = Map<string, number>
export type CogsMatchingMode = 'full' | 'digits'
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
type SalesScheme = 'FBS' | 'FBW' | 'Не указано'

const SALES_SCHEME_ORDER: SalesScheme[] = ['FBS', 'FBW', 'Не указано']
const SALES_SCHEME_LABELS: Record<SalesScheme, string> = {
  FBS: 'FBS — склад продавца',
  FBW: 'FBW — склад ВБ',
  'Не указано': 'Не указано — нет обозначения склада в отчете',
}
const GROUPED_EXPENSES_REPORT_TITLE = 'Общие затраты по Маркетплейсу'
const SALES_AND_RETURNS_GROUP_LABEL = 'Продажи и возвраты'
const WB_COMMISSION_LABEL = 'Комиссия ВБ'
const PAYMENT_SERVICES_LABEL = 'Эквайринг'
const ACCEPTANCE_OPERATIONS_LABEL = 'Операции на приемке'
const MARKETPLACE_EXPENSES_FORMULA = [
  `ABS(SUM("${WB_EXPENSE_COLUMNS.wbCommission}"))`,
  `ABS(SUM("${WB_EXPENSE_COLUMNS.logisticsToBuyer}"))`,
  `ABS(SUM("${WB_EXPENSE_COLUMNS.paymentServices}"))`,
  `ABS(SUM("${WB_EXPENSE_COLUMNS.storage}"))`,
  `ABS(SUM("${WB_EXPENSE_COLUMNS.withholdings}"))`,
  `ABS(SUM("${WB_EXPENSE_COLUMNS.acceptanceOperations}"))`,
  `ABS(SUM("${WB_EXPENSE_COLUMNS.fines}"))`,
  `-SUM("${WB_EXPENSE_COLUMNS.vvCorrection}")`,
  `ABS(SUM("${WB_EXPENSE_COLUMNS.pvzCompensation}"))`,
  `ABS(SUM("${WB_EXPENSE_COLUMNS.transportReimbursement}"))`,
].join(' + ')

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

function normalizeLower(value: string): string {
  return normalize(value).toLowerCase().replace(/ё/g, 'е')
}

function normalizeArticleKey(article: string): string {
  return normalize(article).toLowerCase()
}

function extractDigitsPattern(article: string): string {
  return normalizeArticleKey(article).replace(/\D/g, '')
}

function resolveCogsLookupKey(article: string, mode: CogsMatchingMode): string {
  const normalizedArticle = normalizeArticleKey(article)
  if (mode === 'digits') {
    const digitsPattern = extractDigitsPattern(normalizedArticle)
    if (digitsPattern) return `digits:${digitsPattern}`
  }
  return `full:${normalizedArticle}`
}

function absValue(value: number): number {
  return Math.abs(value)
}

function hasNonZero(value: number): boolean {
  return Math.abs(value) > 0
}

function resolveSalesShareLevel(cumulativeSharePercent: number): SalesShareLevel {
  if (cumulativeSharePercent <= 50) return 'super'
  if (cumulativeSharePercent <= 80) return 'normal'
  if (cumulativeSharePercent <= 95) return 'warning'
  return 'risk'
}

function pickSignedAmount(
  payout: number,
  fallback: number,
  expected: 'negative' | 'positive' | 'any',
): number {
  if (hasNonZero(payout)) return payout
  if (!hasNonZero(fallback)) return 0

  if (expected === 'negative') return fallback > 0 ? -fallback : fallback
  if (expected === 'positive') return fallback < 0 ? -fallback : fallback
  return fallback
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}

function createSalesSchemeMap(): Map<SalesScheme, number> {
  return new Map(SALES_SCHEME_ORDER.map((scheme) => [scheme, 0] as const))
}

function getSalesSchemeTotal(map: Map<SalesScheme, number>): number {
  let total = 0
  for (const value of map.values()) total += value
  return total
}

function scaleSalesSchemeMap(
  sourceMap: Map<SalesScheme, number>,
  targetTotal: number,
): Map<SalesScheme, number> {
  const sourceTotal = getSalesSchemeTotal(sourceMap)
  if (!hasNonZero(sourceTotal)) {
    const fallbackMap = createSalesSchemeMap()
    fallbackMap.set('Не указано', targetTotal)
    return fallbackMap
  }
  if (Math.abs(sourceTotal - targetTotal) < 0.01) {
    return new Map(sourceMap)
  }

  const factor = targetTotal / sourceTotal
  const scaledMap = createSalesSchemeMap()
  for (const scheme of SALES_SCHEME_ORDER) {
    scaledMap.set(scheme, (sourceMap.get(scheme) || 0) * factor)
  }
  return scaledMap
}

function detectSalesSchemeByMethod(rawSalesMethod: string): SalesScheme | null {
  const normalized = normalizeLower(rawSalesMethod)
  if (!normalized) return null
  if (normalized.includes('fbs')) return 'FBS'
  if (normalized.includes('fbw') || normalized.includes('fbo')) return 'FBW'
  return null
}

function resolveSalesScheme(
  row: WbRow,
  bySrid: Map<string, SalesScheme>,
  byBasketId: Map<string, SalesScheme>,
): SalesScheme {
  const directScheme = detectSalesSchemeByMethod(row.salesMethod)
  if (directScheme) return directScheme

  if (row.srid && bySrid.has(row.srid)) {
    return bySrid.get(row.srid)!
  }
  if (row.basketId && byBasketId.has(row.basketId)) {
    return byBasketId.get(row.basketId)!
  }

  const normalizedWarehouse = normalizeLower(row.warehouse)
  if (normalizedWarehouse.includes('склад поставщика')) {
    return 'FBS'
  }

  return 'Не указано'
}

function parseCsvWithDelimiterFallback(rawCsv: string): string[][] {
  const normalized = rawCsv.replace(/^\uFEFF/, '')
  const semicolonRows = parseCsv(normalized, WB_CSV_LAYOUT.delimiter)
  if (semicolonRows.some((row) => row.length > 1)) return semicolonRows
  return parseCsv(normalized, WB_CSV_LAYOUT.cogsFallbackDelimiter)
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

export function extractWildberriesCogsCsv(rawCsv: string): string | null {
  const parsedRows = parseWildberriesCogsRows(rawCsv)
  if (!parsedRows) return null

  const lines = [`${WB_COGS_COLUMNS.article};${WB_COGS_COLUMNS.cogs}`]
  for (const row of parsedRows) {
    lines.push(`${escapeCsvCell(row.article)};${String(row.cogs)}`)
  }
  return lines.join('\n')
}

export function buildWildberriesCogsMap(
  rawCsv: string,
  mode: CogsMatchingMode = 'full',
): CogsByArticleMap | null {
  const parsedRows = parseWildberriesCogsRows(rawCsv)
  if (!parsedRows) return null

  const byArticle = new Map<string, { sum: number, count: number }>()
  for (const row of parsedRows) {
    const articleKey = resolveCogsLookupKey(row.article, mode)
    const current = byArticle.get(articleKey) || { sum: 0, count: 0 }
    current.sum += row.cogs
    current.count += 1
    byArticle.set(articleKey, current)
  }

  const cogsMap: CogsByArticleMap = new Map()
  for (const [articleKey, stats] of byArticle.entries()) {
    if (stats.count === 0) continue
    cogsMap.set(articleKey, stats.sum / stats.count)
  }
  return cogsMap
}

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

function getRowAmount(row: WbRow): number {
  const reason = normalizeLower(row.reason)
  const payout = row.payout

  if (reason === 'продажа' || reason === 'возврат') {
    return payout
  }

  if (reason === 'компенсация скидки по программе лояльности') {
    const loyaltyAmount = absValue(row.loyaltyCompensation) - absValue(row.loyaltyProgramCost) - absValue(row.loyaltyPointsWithheld)
    return hasNonZero(loyaltyAmount) ? loyaltyAmount : payout
  }

  if (includesAny(reason, ['логистика', 'коррекция логистики'])) {
    return pickSignedAmount(payout, absValue(row.logisticsCost), 'negative')
  }

  if (reason === 'возмещение за выдачу и возврат товаров на пвз') {
    return pickSignedAmount(payout, absValue(row.pvzCompensation), 'negative')
  }

  if (reason === 'возмещение издержек по перевозке/по складским операциям с товаром') {
    return pickSignedAmount(payout, absValue(row.transportReimbursement), 'negative')
  }

  if (reason === 'хранение') {
    return pickSignedAmount(payout, absValue(row.storageCost), 'negative')
  }

  if (reason === 'обработка товара') {
    return pickSignedAmount(payout, absValue(row.withholdings) + absValue(row.acceptanceOperations), 'negative')
  }

  if (includesAny(reason, ['удержан', 'услуга платной доставки', 'бронирование товара через самовывоз', 'разовое изменение срока перечисления'])) {
    return pickSignedAmount(payout, absValue(row.withholdings), 'negative')
  }

  if (reason === 'штраф') {
    return pickSignedAmount(payout, absValue(row.fines), 'negative')
  }

  if (includesAny(reason, ['компенсация ущерба', 'добровольная компенсация при возврате'])) {
    return pickSignedAmount(payout, 0, 'positive')
  }

  if (includesAny(reason, ['коррекция продаж', 'коррекция эквайринга'])) {
    return pickSignedAmount(payout, row.vvCorrection, 'any')
  }

  if (reason === 'стоимость участия в программе лояльности') {
    return pickSignedAmount(payout, absValue(row.loyaltyProgramCost), 'negative')
  }

  if (reason === 'сумма удержанная за начисленные баллы программы лояльности') {
    return pickSignedAmount(payout, absValue(row.loyaltyPointsWithheld), 'negative')
  }

  if (hasNonZero(payout)) return payout

  const fallbackKnownAmount =
    row.vvCorrection
    + absValue(row.loyaltyCompensation)
    - absValue(row.loyaltyProgramCost)
    - absValue(row.loyaltyPointsWithheld)
    - absValue(row.logisticsCost)
    - absValue(row.paymentServicesCommission)
    - absValue(row.pvzCompensation)
    - absValue(row.transportReimbursement)
    - absValue(row.storageCost)
    - absValue(row.withholdings)
    - absValue(row.acceptanceOperations)
    - absValue(row.fines)
  const fallback = fallbackKnownAmount
  return fallback !== 0 ? fallback : 0
}

function classifyGroup(rawLabel: string): ClassifiedGroup {
  const label = normalize(rawLabel) || 'Без обоснования'
  const normalized = normalizeLower(label)

  if (normalized === 'продажа' || normalized === 'возврат') {
    return { label: 'Продажи и возвраты', withSalesShare: false }
  }
  if (
    normalized.includes('логист')
    || normalized.includes('пвз')
    || normalized.includes('перевоз')
  ) {
    return { label: 'Логистика', withSalesShare: true }
  }
  if (normalized.includes('хранен')) {
    return { label: 'Хранение ФБО', withSalesShare: true }
  }
  if (normalized.includes('обработк')) {
    return { label: 'Обработка товара', withSalesShare: true }
  }
  if (normalized.includes('удержан')) {
    return { label: 'Расход на рекламу', withSalesShare: true }
  }
  if (normalized.includes('штраф')) {
    return { label: 'Штрафы', withSalesShare: true }
  }
  if (normalized.includes('компенсац') && normalized.includes('ущерб')) {
    return { label: 'Компенсация ущерба', withSalesShare: true }
  }
  if (normalized.includes('добровольн') && normalized.includes('компенсац') && normalized.includes('возврат')) {
    return { label: 'Добровольная компенсация', withSalesShare: true }
  }
  if (normalized.includes('коррекц') && normalized.includes('продаж')) {
    return { label: 'Коррекция продаж', withSalesShare: true }
  }
  if (normalized.includes('коррекц') && normalized.includes('эквайр')) {
    return { label: 'Коррекция эквайринга', withSalesShare: true }
  }
  if (normalized.includes('платн') && normalized.includes('доставк')) {
    return { label: 'Платная доставка', withSalesShare: true }
  }
  if (normalized.includes('бронирован')) {
    return { label: 'Бронирование', withSalesShare: true }
  }
  if (normalized.includes('разов') && normalized.includes('срок') && normalized.includes('перечислен')) {
    return { label: 'Вывести сейчас', withSalesShare: true }
  }
  if (normalized.includes('лояльност')) {
    return { label: 'Компенсация скидки', withSalesShare: true }
  }

  return { label, withSalesShare: true }
}

function buildPeriodLabel(sumByDate: Map<string, number>): string | undefined {
  const timestamps = Array.from(sumByDate.keys())
    .map((label) => toDateTimestamp(label))
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((a, b) => a - b)

  if (timestamps.length === 0) return undefined

  const formatter = new Intl.DateTimeFormat('ru-RU')
  const from = formatter.format(new Date(timestamps[0]))
  const to = formatter.format(new Date(timestamps[timestamps.length - 1]))
  return from === to ? from : `${from} - ${to}`
}

function sortByAbsDesc(entries: [string, number][]): [string, number][] {
  return entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
}

function toMetrics(
  entries: [string, number][],
  formulaBuilder: (label: string) => string,
  type: ValueType = 'currency',
): AccrualMetric[] {
  return entries.map(([label, value]) => ({
    label,
    value,
    type,
    formula: formulaBuilder(label),
  }))
}

export function getWildberriesMissingCogsArticles(
  rawCsv: string,
  cogsByArticleMap: CogsByArticleMap | null,
  articlePattern = '*',
  cogsMatchingMode: CogsMatchingMode = 'full',
  excludePattern = false,
): string[] {
  if (!cogsByArticleMap || cogsByArticleMap.size === 0) return []

  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), WB_CSV_LAYOUT.delimiter)
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === WB_CSV_LAYOUT.headerFirstCell
      && normalize(row[1]) === WB_CSV_LAYOUT.headerSecondCell,
  )
  if (headerIndex === -1) return []

  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))
  const articleIdx = colIndex.get(WB_BASE_COLUMNS.article)
  if (articleIdx === undefined) return []

  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => normalize(cell) !== ''))

  const missingByKey = new Map<string, string>()
  for (const row of dataRows) {
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

export function buildWildberriesTopProducts(
  rawCsv: string,
  articlePattern = '*',
  cogsByArticleMap: CogsByArticleMap | null = null,
  cogsMatchingMode: CogsMatchingMode = 'full',
  excludePattern = false,
): WildberriesTopProductItem[] {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), WB_CSV_LAYOUT.delimiter)
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === WB_CSV_LAYOUT.headerFirstCell
      && normalize(row[1]) === WB_CSV_LAYOUT.headerSecondCell,
  )
  if (headerIndex === -1) return []

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

  const byArticle = new Map<string, {
    salesCount: number
    revenue: number
    cogsTotal: number
    hasCogs: boolean
    nomenclatureCode: string | null
  }>()

  for (const row of dataRows) {
    const article = normalize(getCell(row, WB_BASE_COLUMNS.article))
    if (!article || !isArticleIncludedByPattern(article, articlePattern, excludePattern)) continue

    const reasonLower = normalizeLower(getCell(row, WB_BASE_COLUMNS.reason))
    if (reasonLower !== 'продажа') continue

    const quantity = parseNumber(getCell(row, WB_QUANTITY_COLUMNS.qty)) ?? 0
    const revenue = parseNumber(getCell(row, WB_REVENUE_COLUMNS.retailPrice)) ?? 0
    const nomenclatureCode = normalize(getCell(row, WB_BASE_COLUMNS.nomenclatureCode)) || null

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

export function buildWildberriesAccrualReports(
  rawCsv: string,
  vatRatePercent = 5,
  taxRatePercent = 6,
  articlePattern = '*',
  cogsByArticleMap: CogsByArticleMap | null = null,
  cogsMatchingMode: CogsMatchingMode = 'full',
  excludePattern = false,
): AccrualGroup[] {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), WB_CSV_LAYOUT.delimiter)
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === WB_CSV_LAYOUT.headerFirstCell
      && normalize(row[1]) === WB_CSV_LAYOUT.headerSecondCell,
  )
  if (headerIndex === -1) {
    throw new Error('Не найдена строка заголовков еженедельного отчета Wildberries.')
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

  const filteredRows = dataRows.filter((row) => {
    const article = normalize(getCell(row, WB_BASE_COLUMNS.article))
    return isArticleIncludedByPattern(article, articlePattern, excludePattern)
  })

  const parsedRows: WbRow[] = filteredRows.map((row) => ({
    article: normalize(getCell(row, WB_BASE_COLUMNS.article)),
    documentType: normalize(getCell(row, WB_BASE_COLUMNS.documentType)),
    reason: normalize(getCell(row, WB_BASE_COLUMNS.reason)),
    salesDate: normalize(getCell(row, WB_BASE_COLUMNS.salesDate)),
    salesMethod: normalize(getCell(row, WB_BASE_COLUMNS.salesMethod)),
    warehouse: normalize(getCell(row, WB_BASE_COLUMNS.warehouse)),
    basketId: normalize(getCell(row, WB_BASE_COLUMNS.basketId)),
    srid: normalize(getCell(row, WB_BASE_COLUMNS.srid)),
    logisticsKind: normalize(getCell(row, WB_BASE_COLUMNS.logisticsKind)),
    quantity: parseNumber(getCell(row, WB_QUANTITY_COLUMNS.qty)) ?? 0,
    returnCount: parseNumber(getCell(row, WB_QUANTITY_COLUMNS.returnQty)) ?? 0,
    deliveryCount: parseNumber(getCell(row, WB_QUANTITY_COLUMNS.deliveryQty)) ?? 0,
    retailPrice: parseNumber(getCell(row, WB_REVENUE_COLUMNS.retailPrice)) ?? 0,
    retailPriceWithDiscount: parseNumber(getCell(row, WB_REVENUE_COLUMNS.retailPriceWithDiscount)) ?? 0,
    sellerRealized: parseNumber(getCell(row, WB_REVENUE_COLUMNS.sellerRealized)) ?? 0,
    payout: parseNumber(getCell(row, WB_REVENUE_COLUMNS.payout)) ?? 0,
    logisticsCost: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.logisticsToBuyer)) ?? 0,
    wbCommission: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.wbCommission)) ?? 0,
    paymentServicesCommission: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.paymentServices)) ?? 0,
    pvzCompensation: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.pvzCompensation)) ?? 0,
    transportReimbursement: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.transportReimbursement)) ?? 0,
    storageCost: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.storage)) ?? 0,
    withholdings: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.withholdings)) ?? 0,
    acceptanceOperations: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.acceptanceOperations)) ?? 0,
    fines: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.fines)) ?? 0,
    vvCorrection: parseNumber(getCell(row, WB_EXPENSE_COLUMNS.vvCorrection)) ?? 0,
    loyaltyCompensation: parseNumber(getCell(row, WB_LOYALTY_COLUMNS.loyaltyCompensation)) ?? 0,
    loyaltyProgramCost: parseNumber(getCell(row, WB_LOYALTY_COLUMNS.loyaltyProgramCost)) ?? 0,
    loyaltyPointsWithheld: parseNumber(getCell(row, WB_LOYALTY_COLUMNS.loyaltyPointsWithheld)) ?? 0,
  }))

  const sumByGroup = new Map<string, number>()
  const sumByDate = new Map<string, number>()
  const sumByDateAndReason = new Map<string, Map<string, number>>()
  const salesDateRangeMap = new Map<string, number>()
  const groupTypeBreakdown = new Map<string, Map<string, number>>()
  const salesRevenueByScheme = createSalesSchemeMap()
  const salesTransferByScheme = createSalesSchemeMap()

  let wbCommissionAmount = 0
  let logisticsAmount = 0
  let paymentServicesAmount = 0
  let storageAmount = 0
  let withholdingsAmount = 0
  let acceptanceOperationsAmount = 0
  let finesAmount = 0
  let vvCorrectionAmount = 0
  let pvzCompensationAmount = 0
  let transportReimbursementAmount = 0

  let salesQuantity = 0
  let returnsAndCancellationsQuantity = 0
  let returnsAmount = 0
  let revenueBeforeSpp = 0
  let revenueWithoutSpp = 0
  let cogsFromFile = 0
  let cogsMatchedRows = 0

  const schemeBySrid = new Map<string, SalesScheme>()
  const schemeByBasketId = new Map<string, SalesScheme>()
  for (const row of parsedRows) {
    const detectedScheme = detectSalesSchemeByMethod(row.salesMethod)
    if (!detectedScheme) continue
    if (row.srid) schemeBySrid.set(row.srid, detectedScheme)
    if (row.basketId) schemeByBasketId.set(row.basketId, detectedScheme)
  }

  const addToMap = <K extends string>(map: Map<K, number>, key: K, value: number): void => {
    map.set(key, (map.get(key) || 0) + value)
  }

  for (const row of parsedRows) {
    const reason = row.reason || 'Без обоснования'
    const amount = getRowAmount(row)

    const reasonLower = normalizeLower(reason)
    if (reasonLower === 'продажа') {
      salesQuantity += row.quantity
      const saleRevenue = row.retailPrice
      revenueBeforeSpp += saleRevenue
      revenueWithoutSpp += row.sellerRealized
      const saleDate = row.salesDate || 'Без даты'
      addToMap(salesDateRangeMap, saleDate, 0)
      const salesScheme = resolveSalesScheme(row, schemeBySrid, schemeByBasketId)
      addToMap(salesRevenueByScheme, salesScheme, saleRevenue)
      addToMap(salesTransferByScheme, salesScheme, row.payout)

      if (cogsByArticleMap && cogsByArticleMap.size > 0) {
        const articleKey = resolveCogsLookupKey(row.article, cogsMatchingMode)
        const unitCogs = cogsByArticleMap.get(articleKey)
        if (articleKey && unitCogs !== undefined) {
          cogsFromFile += row.quantity * unitCogs
          cogsMatchedRows += 1
        }
      }
    }
    wbCommissionAmount += absValue(row.wbCommission)
    logisticsAmount += absValue(row.logisticsCost)
    paymentServicesAmount += absValue(row.paymentServicesCommission)
    storageAmount += absValue(row.storageCost)
    withholdingsAmount += absValue(row.withholdings)
    acceptanceOperationsAmount += absValue(row.acceptanceOperations)
    finesAmount += absValue(row.fines)
    vvCorrectionAmount += -row.vvCorrection
    pvzCompensationAmount += absValue(row.pvzCompensation)
    transportReimbursementAmount += absValue(row.transportReimbursement)

    if (reasonLower === 'возврат') {
      returnsAmount += amount
    }

    returnsAndCancellationsQuantity += row.returnCount

    addToMap(sumByGroup, reason, amount)

    const date = row.salesDate || 'Без даты'
    addToMap(sumByDate, date, amount)
    if (!sumByDateAndReason.has(date)) {
      sumByDateAndReason.set(date, new Map<string, number>())
    }
    addToMap(sumByDateAndReason.get(date)!, reason, amount)

    const breakdownType = row.logisticsKind || row.documentType || 'Без подтипа'
    if (!groupTypeBreakdown.has(reason)) {
      groupTypeBreakdown.set(reason, new Map<string, number>())
    }
    addToMap(groupTypeBreakdown.get(reason)!, breakdownType, amount)
  }

  const sppAndPromotions = revenueBeforeSpp - revenueWithoutSpp
  const returnsExpense = returnsAmount === 0 ? 0 : -Math.abs(returnsAmount)
  const marketplaceExpenses =
    wbCommissionAmount
    + logisticsAmount
    + paymentServicesAmount
    + storageAmount
    + withholdingsAmount
    + acceptanceOperationsAmount
    + finesAmount
    + vvCorrectionAmount
    + pvzCompensationAmount
    + transportReimbursementAmount
  const transferToBank = revenueBeforeSpp - marketplaceExpenses
  const totalRate = (vatRatePercent + taxRatePercent) / 100
  const taxAmount = revenueBeforeSpp !== 0 ? revenueBeforeSpp * totalRate : 0
  const cogs: number | null = cogsMatchedRows > 0 ? cogsFromFile : null
  const netProfit = transferToBank - taxAmount - (cogs ?? 0)
  const marginRate = revenueBeforeSpp !== 0 ? (netProfit / revenueBeforeSpp) * 100 : null

  const salesBase = revenueBeforeSpp > 0 ? revenueBeforeSpp : null
  const rubleIntegerFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
  const formatSalesShare = (value: number): string | null => {
    if (!salesBase) return null
    const sharePercent = (Math.abs(value) / salesBase) * 100
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(sharePercent)}%`
  }

  const groupedByLabel = new Map<string, { value: number, withSalesShare: boolean, sourceLabels: Set<string> }>()
  for (const [rawLabel, value] of sortByAbsDesc(Array.from(sumByGroup.entries()))) {
    const group = classifyGroup(rawLabel)
    const current = groupedByLabel.get(group.label) || {
      value: 0,
      withSalesShare: group.withSalesShare,
      sourceLabels: new Set<string>(),
    }
    current.value += value
    current.withSalesShare = current.withSalesShare || group.withSalesShare
    current.sourceLabels.add(rawLabel)
    groupedByLabel.set(group.label, current)
  }
  if (hasNonZero(wbCommissionAmount)) {
    groupedByLabel.set(WB_COMMISSION_LABEL, {
      value: -wbCommissionAmount,
      withSalesShare: true,
      sourceLabels: new Set<string>(),
    })
  }
  if (hasNonZero(paymentServicesAmount)) {
    groupedByLabel.set(PAYMENT_SERVICES_LABEL, {
      value: -paymentServicesAmount,
      withSalesShare: true,
      sourceLabels: new Set<string>(),
    })
  }
  if (hasNonZero(acceptanceOperationsAmount)) {
    groupedByLabel.set(ACCEPTANCE_OPERATIONS_LABEL, {
      value: -acceptanceOperationsAmount,
      withSalesShare: true,
      sourceLabels: new Set<string>(),
    })
  }

  const groupMetrics: AccrualMetric[] = sortByAbsDesc(
    Array.from(groupedByLabel.entries()).map(([label, data]) => [label, data.value] as [string, number]),
  )
    .filter(([label]) => label !== SALES_AND_RETURNS_GROUP_LABEL)
    .map(([label, value]) => {
    const data = groupedByLabel.get(label)!
    if (label === WB_COMMISSION_LABEL) {
      return {
        label,
        value,
        type: 'currency',
        formula: `-ABS(SUM("${WB_EXPENSE_COLUMNS.wbCommission}"))`,
        shareText: formatSalesShare(value),
      }
    }
    if (label === PAYMENT_SERVICES_LABEL) {
      return {
        label,
        value,
        type: 'currency',
        formula: `-ABS(SUM("${WB_EXPENSE_COLUMNS.paymentServices}"))`,
        shareText: formatSalesShare(value),
      }
    }
    if (label === ACCEPTANCE_OPERATIONS_LABEL) {
      return {
        label,
        value,
        type: 'currency',
        formula: `-ABS(SUM("${WB_EXPENSE_COLUMNS.acceptanceOperations}"))`,
        shareText: formatSalesShare(value),
      }
    }
    const sourceLabels = Array.from(data.sourceLabels)
    const formula = sourceLabels.length === 1
      ? `SUM(net effect), фильтр: "Обоснование для оплаты" = "${sourceLabels[0]}"`
      : `SUM(net effect), фильтр: "Обоснование для оплаты" IN (${sourceLabels.map((item) => `"${item}"`).join(', ')})`

    return {
      label,
      value,
      type: 'currency',
      formula,
      shareText: data.withSalesShare ? formatSalesShare(value) : null,
    }
  })
  groupMetrics.push({
    label: 'Итог',
    value: -Math.abs(marketplaceExpenses),
    type: 'currency',
    formula: MARKETPLACE_EXPENSES_FORMULA,
    shareText: formatSalesShare(marketplaceExpenses),
  })

  const schemeRevenueTotal = getSalesSchemeTotal(salesRevenueByScheme)
  const useRevenueAsSchemeBase = hasNonZero(schemeRevenueTotal)
  const rawSchemeMap = useRevenueAsSchemeBase ? salesRevenueByScheme : salesTransferByScheme
  const fallbackTransferTarget = hasNonZero(transferToBank)
    ? transferToBank
    : getSalesSchemeTotal(salesTransferByScheme)
  const schemeMetricsMap = useRevenueAsSchemeBase
    ? rawSchemeMap
    : scaleSalesSchemeMap(rawSchemeMap, fallbackTransferTarget)
  const schemeMetrics: AccrualMetric[] = SALES_SCHEME_ORDER
    .map((scheme) => ({
      scheme,
      value: schemeMetricsMap.get(scheme) || 0,
    }))
    .filter(({ scheme, value }) => !(scheme === 'Не указано' && value === 0))
    .map(({ scheme, value }) => ({
      label: SALES_SCHEME_LABELS[scheme],
      value,
      type: 'currency',
      formula: useRevenueAsSchemeBase
        ? `SUM("Цена розничная"), фильтр: "Обоснование для оплаты" = "Продажа", модель ${scheme}. Модель определяется по "Способы продажи и тип товара" из связанных строк (Srid/Id корзины заказа).`
        : `SUM(поступления из строк "Продажа"), модель ${scheme}. Модель определяется по "Способы продажи и тип товара" из связанных строк (Srid/Id корзины заказа). Значения приведены пропорционально к "Перевод в банк".`,
    }))

  const structureSummaries: AccrualGroup[] = Array.from(groupTypeBreakdown.entries())
    .map(([group, types]) => {
      const topTypes = sortByAbsDesc(Array.from(types.entries())).slice(0, 3)
      const groupTotal = Array.from(types.values()).reduce((acc, value) => acc + value, 0)
      return {
        title: `Структура: ${group}`,
        metrics: toMetrics(
          topTypes,
          (label) => `SUM(net effect), фильтр: "Обоснование для оплаты" = "${group}" и подтип = "${label}"`,
        ),
        total: groupTotal,
      }
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map(({ title, metrics }) => ({ title, metrics }))

  const periodLabel = buildPeriodLabel(salesDateRangeMap.size > 0 ? salesDateRangeMap : sumByDate)

  return [
    {
      title: 'Итоги периода',
      rowCount: parsedRows.length,
      periodLabel,
      metrics: [
        {
          label: 'Количество продаж',
          value: salesQuantity,
          type: 'number',
          formula: 'SUM("Кол-во"), фильтр: "Обоснование для оплаты" = "Продажа"',
        },
        {
          label: 'Отмены, возвраты, не выкупы',
          value: returnsAndCancellationsQuantity,
          type: 'number',
          formula: 'SUM("Количество возврата")',
        },
        {
          label: 'Выручка с учетом СПП',
          value: revenueBeforeSpp,
          type: 'currency',
          formula: 'SUM("Цена розничная"), фильтр: "Обоснование для оплаты" = "Продажа"',
        },
        {
          label: 'Выручка без СПП',
          value: revenueWithoutSpp,
          type: 'currency',
          formula: 'SUM("Вайлдберриз реализовал Товар (Пр)"), фильтр: "Обоснование для оплаты" = "Продажа"',
        },
        {
          label: 'СПП и акции',
          value: sppAndPromotions,
          type: 'currency',
          formula: 'Выручка с учетом СПП - Выручка без СПП',
        },
        {
          label: 'Возвраты',
          value: returnsExpense,
          type: 'currency',
          formula: '-ABS(SUM(net effect), фильтр: "Обоснование для оплаты" = "Возврат")',
        },
        {
          label: 'Общие затраты по Маркетплейсу',
          value: marketplaceExpenses,
          type: 'currency',
          formula: MARKETPLACE_EXPENSES_FORMULA,
          shareText: formatSalesShare(marketplaceExpenses),
        },
        {
          label: 'Перевод в банк',
          value: transferToBank,
          type: 'currency',
          formula: 'Выручка с учетом СПП - Общие затраты по Маркетплейсу',
        },
        {
          label: 'Себестоимость',
          value: cogs,
          type: 'currency',
          formula: cogs !== null
            ? 'SUM(Кол-во продаж * Себестоимость из загруженного CSV себестоимости)'
            : 'Нет данных: загрузите CSV с себестоимостью товаров',
          shareText: cogs !== null ? formatSalesShare(cogs) : null,
        },
        {
          label: 'Налог',
          value: taxAmount,
          type: 'currency',
          formula: `(${taxRatePercent}% + ${vatRatePercent}%) * Выручка с учетом СПП`,
        },
        {
          label: 'Маржинальность',
          value: marginRate,
          type: 'percent',
          formula: 'Чистая прибыль / Выручка с учетом СПП * 100%',
        },
        {
          label: 'Чистая прибыль',
          value: netProfit,
          type: 'currency',
          formula: cogs !== null
            ? 'Перевод в банк - Налог - Себестоимость'
            : 'Перевод в банк - Налог',
        },
      ],
    },
    {
      title: GROUPED_EXPENSES_REPORT_TITLE,
      metrics: groupMetrics,
    },
    {
      title: 'Схема работы',
      metrics: schemeMetrics,
    },
    {
      title: 'Динамика по датам начисления',
      metrics: Array.from(sumByDate.entries())
        .sort(([a], [b]) => {
          const aTime = toDateTimestamp(a)
          const bTime = toDateTimestamp(b)
          if (aTime === null && bTime === null) return a.localeCompare(b, 'ru')
          if (aTime === null) return 1
          if (bTime === null) return -1
          return aTime - bTime
        })
        .map(([dateLabel, value]) => {
          const reasonsByDate = sumByDateAndReason.get(dateLabel)
          const topNegativeReasonEntry = reasonsByDate
            ? Array.from(reasonsByDate.entries())
              .filter(([, reasonValue]) => reasonValue < 0)
              .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
            : null
          const topNegativeReason = topNegativeReasonEntry?.[0]
          const topNegativeAmount = topNegativeReasonEntry ? Math.abs(topNegativeReasonEntry[1]) : null

          const accrualTypeLabel = value > 0
            ? 'Выручка'
            : value < 0
              ? (topNegativeReason && topNegativeAmount !== null
                ? `${topNegativeReason} (${rubleIntegerFormatter.format(topNegativeAmount)}р)`
                : 'Списание')
              : 'Нейтрально'

          return {
            label: dateLabel,
            value,
            type: 'currency' as const,
            shareText: accrualTypeLabel,
            formula: value < 0 && topNegativeReason
              ? `SUM(net effect), фильтр: "Дата продажи" = "${dateLabel}". Справа показано крупнейшее списание по "Обоснование для оплаты": "${topNegativeReason}".`
              : `SUM(net effect), фильтр: "Дата продажи" = "${dateLabel}"`,
          }
        }),
    },
    ...structureSummaries,
  ]
}
