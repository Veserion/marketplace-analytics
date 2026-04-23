import type { AccrualGroup, AccrualMetric, ValueType } from '@/entities/ozon-report/model/types'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'

type WbRow = {
  article: string
  documentType: string
  reason: string
  salesDate: string
  salesMethod: string
  logisticsKind: string
  quantity: number
  returnCount: number
  deliveryCount: number
  retailPrice: number
  retailPriceWithDiscount: number
  sellerRealized: number
  payout: number
  logisticsCost: number
  pvzCompensation: number
  transportReimbursement: number
  storageCost: number
  withholdings: number
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

function parseCsvWithDelimiterFallback(rawCsv: string): string[][] {
  const normalized = rawCsv.replace(/^\uFEFF/, '')
  const semicolonRows = parseCsv(normalized, ';')
  if (semicolonRows.some((row) => row.length > 1)) return semicolonRows
  return parseCsv(normalized, ',')
}

function findCogsHeader(headers: string[]): { articleIdx: number, cogsIdx: number } | null {
  const normalizedHeaders = headers.map((header) => normalizeLower(header))
  const articleIdx = normalizedHeaders.findIndex((header) => header === 'артикул')
  if (articleIdx === -1) return null

  const cogsIdx = normalizedHeaders.findIndex((header) => header === 'себестоимость')
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

  const lines = ['Артикул;Себестоимость']
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
    return pickSignedAmount(payout, absValue(row.withholdings), 'negative')
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
    - absValue(row.pvzCompensation)
    - absValue(row.transportReimbursement)
    - absValue(row.storageCost)
    - absValue(row.withholdings)
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
    return { label: 'Хранение', withSalesShare: true }
  }
  if (normalized.includes('обработк')) {
    return { label: 'Обработка товара', withSalesShare: true }
  }
  if (normalized.includes('удержан')) {
    return { label: 'Удержания', withSalesShare: true }
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
    return { label: 'Лояльность', withSalesShare: true }
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
): string[] {
  if (!cogsByArticleMap || cogsByArticleMap.size === 0) return []

  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), ';')
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === '№' && normalize(row[1]) === 'Номер поставки',
  )
  if (headerIndex === -1) return []

  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))
  const articleIdx = colIndex.get('Артикул поставщика')
  if (articleIdx === undefined) return []

  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => normalize(cell) !== ''))

  const missingByKey = new Map<string, string>()
  for (const row of dataRows) {
    const article = normalize(row[articleIdx] || '')
    if (!article) continue
    if (!matchesArticlePattern(article, articlePattern)) continue

    const articleKey = resolveCogsLookupKey(article, cogsMatchingMode)
    if (cogsByArticleMap.has(articleKey)) continue
    if (!missingByKey.has(articleKey)) {
      missingByKey.set(articleKey, article)
    }
  }

  return Array.from(missingByKey.values()).sort((a, b) => a.localeCompare(b, 'ru'))
}

export function buildWildberriesAccrualReports(
  rawCsv: string,
  vatRatePercent = 5,
  taxRatePercent = 6,
  articlePattern = '*',
  cogsByArticleMap: CogsByArticleMap | null = null,
  cogsMatchingMode: CogsMatchingMode = 'full',
): AccrualGroup[] {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), ';')
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === '№' && normalize(row[1]) === 'Номер поставки',
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
    const article = normalize(getCell(row, 'Артикул поставщика'))
    return matchesArticlePattern(article, articlePattern)
  })

  const parsedRows: WbRow[] = filteredRows.map((row) => ({
    article: normalize(getCell(row, 'Артикул поставщика')),
    documentType: normalize(getCell(row, 'Тип документа')),
    reason: normalize(getCell(row, 'Обоснование для оплаты')),
    salesDate: normalize(getCell(row, 'Дата продажи')),
    salesMethod: normalize(getCell(row, 'Способы продажи и тип товара')),
    logisticsKind: normalize(getCell(row, 'Виды логистики, штрафов и корректировок ВВ')),
    quantity: parseNumber(getCell(row, 'Кол-во')) ?? 0,
    returnCount: parseNumber(getCell(row, 'Количество возврата')) ?? 0,
    deliveryCount: parseNumber(getCell(row, 'Количество доставок')) ?? 0,
    retailPrice: parseNumber(getCell(row, 'Цена розничная')) ?? 0,
    retailPriceWithDiscount: parseNumber(getCell(row, 'Цена розничная с учетом согласованной скидки')) ?? 0,
    sellerRealized: parseNumber(getCell(row, 'Вайлдберриз реализовал Товар (Пр)')) ?? 0,
    payout: parseNumber(getCell(row, 'К перечислению Продавцу за реализованный Товар')) ?? 0,
    logisticsCost: parseNumber(getCell(row, 'Услуги по доставке товара покупателю')) ?? 0,
    pvzCompensation: parseNumber(getCell(row, 'Возмещение за выдачу и возврат товаров на ПВЗ')) ?? 0,
    transportReimbursement: parseNumber(getCell(row, 'Возмещение издержек по перевозке/по складским операциям с товаром')) ?? 0,
    storageCost: parseNumber(getCell(row, 'Хранение')) ?? 0,
    withholdings: parseNumber(getCell(row, 'Удержания')) ?? 0,
    fines: parseNumber(getCell(row, 'Общая сумма штрафов')) ?? 0,
    vvCorrection: parseNumber(getCell(row, 'Корректировка Вознаграждения Вайлдберриз (ВВ)')) ?? 0,
    loyaltyCompensation: parseNumber(getCell(row, 'Компенсация скидки по программе лояльности')) ?? 0,
    loyaltyProgramCost: parseNumber(getCell(row, 'Стоимость участия в программе лояльности')) ?? 0,
    loyaltyPointsWithheld: parseNumber(getCell(row, 'Сумма удержанная за начисленные баллы программы лояльности')) ?? 0,
  }))

  const sumByGroup = new Map<string, number>()
  const sumByScheme = new Map<string, number>()
  const sumByDate = new Map<string, number>()
  const salesDateRangeMap = new Map<string, number>()
  const groupTypeBreakdown = new Map<string, Map<string, number>>()

  let totalTransferFromRows = 0
  let nonSalesNetAmount = 0
  let positiveCount = 0
  let negativeCount = 0
  let zeroCount = 0

  let salesQuantity = 0
  let returnsAndCancellationsQuantity = 0
  let revenueBeforeSpp = 0
  let revenueWithoutSpp = 0
  let cogsFromFile = 0
  let cogsMatchedRows = 0

  const addToMap = (map: Map<string, number>, key: string, value: number): void => {
    map.set(key, (map.get(key) || 0) + value)
  }

  for (const row of parsedRows) {
    const reason = row.reason || 'Без обоснования'
    const amount = getRowAmount(row)

    totalTransferFromRows += amount
    if (amount > 0) {
      positiveCount += 1
    } else if (amount < 0) {
      negativeCount += 1
    } else {
      zeroCount += 1
    }

    const reasonLower = normalizeLower(reason)
    if (reasonLower === 'продажа') {
      salesQuantity += row.quantity
      revenueBeforeSpp += row.retailPrice !== 0 ? row.retailPrice : row.retailPriceWithDiscount
      revenueWithoutSpp += row.sellerRealized
      const saleDate = row.salesDate || 'Без даты'
      addToMap(salesDateRangeMap, saleDate, 0)

      if (cogsByArticleMap && cogsByArticleMap.size > 0) {
        const articleKey = resolveCogsLookupKey(row.article, cogsMatchingMode)
        const unitCogs = cogsByArticleMap.get(articleKey)
        if (articleKey && unitCogs !== undefined) {
          cogsFromFile += row.quantity * unitCogs
          cogsMatchedRows += 1
        }
      }
    }
    if (reasonLower !== 'продажа' && reasonLower !== 'возврат') {
      nonSalesNetAmount += amount
    }

    returnsAndCancellationsQuantity += row.returnCount

    addToMap(sumByGroup, reason, amount)

    const scheme = row.salesMethod || '(пусто)'
    addToMap(sumByScheme, scheme, amount)

    const date = row.salesDate || 'Без даты'
    addToMap(sumByDate, date, amount)

    const breakdownType = row.logisticsKind || row.documentType || 'Без подтипа'
    if (!groupTypeBreakdown.has(reason)) {
      groupTypeBreakdown.set(reason, new Map<string, number>())
    }
    addToMap(groupTypeBreakdown.get(reason)!, breakdownType, amount)
  }

  const sppAndPromotions = revenueBeforeSpp - revenueWithoutSpp
  const marketplaceExpenses = -nonSalesNetAmount
  const transferToBank = revenueBeforeSpp - marketplaceExpenses
  const totalRate = (vatRatePercent + taxRatePercent) / 100
  const taxAmount = revenueBeforeSpp !== 0 ? revenueBeforeSpp * totalRate : 0
  const cogs: number | null = cogsMatchedRows > 0 ? cogsFromFile : null
  const netProfit = transferToBank - taxAmount - (cogs ?? 0)
  const marginRate = revenueBeforeSpp !== 0 ? (netProfit / revenueBeforeSpp) * 100 : null

  const salesBase = revenueBeforeSpp > 0 ? revenueBeforeSpp : null
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

  const groupMetrics: AccrualMetric[] = sortByAbsDesc(
    Array.from(groupedByLabel.entries()).map(([label, data]) => [label, data.value] as [string, number]),
  ).map(([label, value]) => {
    const data = groupedByLabel.get(label)!
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
          label: 'Выручка до СПП',
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
          formula: 'Выручка до СПП - Выручка без СПП',
        },
        {
          label: 'Общие затраты по Маркетплейсу',
          value: marketplaceExpenses,
          type: 'currency',
          formula: 'Сумма net effect по строкам, кроме "Продажа" и "Возврат" (взята с обратным знаком)',
          shareText: formatSalesShare(marketplaceExpenses),
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
          formula: `(${taxRatePercent}% + ${vatRatePercent}%) * Выручка до СПП`,
        },
        {
          label: 'Чистая прибыль',
          value: netProfit,
          type: 'currency',
          formula: cogs !== null
            ? 'Перевод в банк - Налог - Себестоимость'
            : 'Перевод в банк - Налог',
        },
        {
          label: 'Маржинальность',
          value: marginRate,
          type: 'percent',
          formula: 'Чистая прибыль / Выручка до СПП * 100%',
        },
        {
          label: 'Перевод в банк',
          value: transferToBank,
          type: 'currency',
          formula: 'Выручка до СПП - Общие затраты по Маркетплейсу',
        },
        {
          label: 'Среднее начисление на строку',
          value: parsedRows.length ? transferToBank / parsedRows.length : null,
          type: 'currency',
          formula: 'Перевод в банк / COUNT(строк)',
        },
        {
          label: 'Строк с плюсами',
          value: positiveCount,
          type: 'number',
          formula: 'COUNT(net effect > 0)',
        },
        {
          label: 'Строк с минусами',
          value: negativeCount,
          type: 'number',
          formula: 'COUNT(net effect < 0)',
        },
        {
          label: 'Строк с нулем',
          value: zeroCount,
          type: 'number',
          formula: 'COUNT(net effect = 0)',
        },
      ],
    },
    {
      title: 'Начисления по группам',
      metrics: groupMetrics,
    },
    {
      title: 'Схема работы',
      metrics: toMetrics(
        sortByAbsDesc(Array.from(sumByScheme.entries())),
        (label) => `SUM(net effect), фильтр: "Способы продажи и тип товара" = "${label}"`,
      ),
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
        .map(([label, value]) => ({
          label,
          value,
          type: 'currency' as const,
          formula: `SUM(net effect), фильтр: "Дата продажи" = "${label}"`,
        })),
    },
    ...structureSummaries,
  ]
}
