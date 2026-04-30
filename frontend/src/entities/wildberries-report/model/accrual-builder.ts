import type { AccrualGroup, AccrualMetric, ValueType } from '@/shared/lib/report-types'
import { WB_BASE_COLUMNS, WB_CSV_LAYOUT, WB_EXPENSE_COLUMNS, WB_LOYALTY_COLUMNS, WB_QUANTITY_COLUMNS, WB_REVENUE_COLUMNS } from '@/entities/wildberries-report/model/columns'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'
import type { CsvTable } from '@/shared/lib/reporting'
import { addToNumberMap, assertCsvColumns, createCsvTable, formatSharePercent, isArticleIncludedByPattern, normalizeLower, sortByAbsDesc, stripBom, sumNumberMap } from '@/shared/lib/reporting'
import type { CogsByArticleMap, CogsMatchingMode } from '@/entities/wildberries-report/model/cogs-builder'
import { resolveCogsLookupKey } from '@/entities/wildberries-report/model/cogs-builder'

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
  `(SUM("${WB_REVENUE_COLUMNS.retailPrice}") - SUM("${WB_REVENUE_COLUMNS.payout}"))`,
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

function createSalesSchemeMap(): Map<SalesScheme, number> {
  return new Map(SALES_SCHEME_ORDER.map((scheme) => [scheme, 0] as const))
}

function getSalesSchemeTotal(map: Map<SalesScheme, number>): number {
  return sumNumberMap(map)
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

type WildberriesAccrualAggregate = {
  rowCount: number
  sumByGroup: Map<string, number>
  sumByDate: Map<string, number>
  sumByDateAndReason: Map<string, Map<string, number>>
  salesDateRangeMap: Map<string, number>
  groupTypeBreakdown: Map<string, Map<string, number>>
  salesRevenueByScheme: Map<SalesScheme, number>
  salesTransferByScheme: Map<SalesScheme, number>
  wbCommissionAmount: number
  logisticsAmount: number
  paymentServicesAmount: number
  storageAmount: number
  withholdingsAmount: number
  acceptanceOperationsAmount: number
  finesAmount: number
  vvCorrectionAmount: number
  pvzCompensationAmount: number
  transportReimbursementAmount: number
  salesQuantity: number
  returnsAndCancellationsQuantity: number
  returnsAmount: number
  revenueBeforeSpp: number
  revenueWithoutSpp: number
  payoutForSoldItems: number
  logisticsForSoldItems: number
  storageForSoldItems: number
  withholdingsForSoldItems: number
  acceptanceOperationsForSoldItems: number
  finesForSoldItems: number
  cogsFromFile: number
  cogsMatchedRows: number
}

function parseWildberriesRowsFromTable(
  table: CsvTable,
  articlePattern: string,
  excludePattern: boolean,
): WbRow[] {
  assertCsvColumns(table, [
    WB_BASE_COLUMNS.article,
    WB_BASE_COLUMNS.documentType,
    WB_BASE_COLUMNS.reason,
    WB_BASE_COLUMNS.salesDate,
    WB_BASE_COLUMNS.salesMethod,
    WB_BASE_COLUMNS.warehouse,
    WB_BASE_COLUMNS.basketId,
    WB_BASE_COLUMNS.srid,
    WB_BASE_COLUMNS.logisticsKind,
    WB_QUANTITY_COLUMNS.qty,
    WB_QUANTITY_COLUMNS.returnQty,
    WB_QUANTITY_COLUMNS.deliveryQty,
    WB_REVENUE_COLUMNS.retailPrice,
    WB_REVENUE_COLUMNS.retailPriceWithDiscount,
    WB_REVENUE_COLUMNS.sellerRealized,
    WB_REVENUE_COLUMNS.payout,
    WB_EXPENSE_COLUMNS.logisticsToBuyer,
    WB_EXPENSE_COLUMNS.wbCommission,
    WB_EXPENSE_COLUMNS.paymentServices,
    WB_EXPENSE_COLUMNS.pvzCompensation,
    WB_EXPENSE_COLUMNS.transportReimbursement,
    WB_EXPENSE_COLUMNS.storage,
    WB_EXPENSE_COLUMNS.withholdings,
    WB_EXPENSE_COLUMNS.acceptanceOperations,
    WB_EXPENSE_COLUMNS.fines,
    WB_EXPENSE_COLUMNS.vvCorrection,
    WB_LOYALTY_COLUMNS.loyaltyCompensation,
    WB_LOYALTY_COLUMNS.loyaltyProgramCost,
    WB_LOYALTY_COLUMNS.loyaltyPointsWithheld,
  ], 'еженедельного отчета Wildberries')

  return table.dataRows
    .filter((row) => {
      const article = normalize(table.getCell(row, WB_BASE_COLUMNS.article))
      return isArticleIncludedByPattern(article, articlePattern, excludePattern)
    })
    .map((row) => ({
      article: normalize(table.getCell(row, WB_BASE_COLUMNS.article)),
      documentType: normalize(table.getCell(row, WB_BASE_COLUMNS.documentType)),
      reason: normalize(table.getCell(row, WB_BASE_COLUMNS.reason)),
      salesDate: normalize(table.getCell(row, WB_BASE_COLUMNS.salesDate)),
      salesMethod: normalize(table.getCell(row, WB_BASE_COLUMNS.salesMethod)),
      warehouse: normalize(table.getCell(row, WB_BASE_COLUMNS.warehouse)),
      basketId: normalize(table.getCell(row, WB_BASE_COLUMNS.basketId)),
      srid: normalize(table.getCell(row, WB_BASE_COLUMNS.srid)),
      logisticsKind: normalize(table.getCell(row, WB_BASE_COLUMNS.logisticsKind)),
      quantity: parseNumber(table.getCell(row, WB_QUANTITY_COLUMNS.qty)) ?? 0,
      returnCount: parseNumber(table.getCell(row, WB_QUANTITY_COLUMNS.returnQty)) ?? 0,
      deliveryCount: parseNumber(table.getCell(row, WB_QUANTITY_COLUMNS.deliveryQty)) ?? 0,
      retailPrice: parseNumber(table.getCell(row, WB_REVENUE_COLUMNS.retailPrice)) ?? 0,
      retailPriceWithDiscount: parseNumber(table.getCell(row, WB_REVENUE_COLUMNS.retailPriceWithDiscount)) ?? 0,
      sellerRealized: parseNumber(table.getCell(row, WB_REVENUE_COLUMNS.sellerRealized)) ?? 0,
      payout: parseNumber(table.getCell(row, WB_REVENUE_COLUMNS.payout)) ?? 0,
      logisticsCost: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.logisticsToBuyer)) ?? 0,
      wbCommission: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.wbCommission)) ?? 0,
      paymentServicesCommission: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.paymentServices)) ?? 0,
      pvzCompensation: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.pvzCompensation)) ?? 0,
      transportReimbursement: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.transportReimbursement)) ?? 0,
      storageCost: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.storage)) ?? 0,
      withholdings: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.withholdings)) ?? 0,
      acceptanceOperations: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.acceptanceOperations)) ?? 0,
      fines: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.fines)) ?? 0,
      vvCorrection: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.vvCorrection)) ?? 0,
      loyaltyCompensation: parseNumber(table.getCell(row, WB_LOYALTY_COLUMNS.loyaltyCompensation)) ?? 0,
      loyaltyProgramCost: parseNumber(table.getCell(row, WB_LOYALTY_COLUMNS.loyaltyProgramCost)) ?? 0,
      loyaltyPointsWithheld: parseNumber(table.getCell(row, WB_LOYALTY_COLUMNS.loyaltyPointsWithheld)) ?? 0,
    }))
}

function buildSalesSchemeLookups(rows: WbRow[]): {
  schemeBySrid: Map<string, SalesScheme>
  schemeByBasketId: Map<string, SalesScheme>
} {
  const schemeBySrid = new Map<string, SalesScheme>()
  const schemeByBasketId = new Map<string, SalesScheme>()
  for (const row of rows) {
    const detectedScheme = detectSalesSchemeByMethod(row.salesMethod)
    if (!detectedScheme) continue
    if (row.srid) schemeBySrid.set(row.srid, detectedScheme)
    if (row.basketId) schemeByBasketId.set(row.basketId, detectedScheme)
  }
  return { schemeBySrid, schemeByBasketId }
}

function createWildberriesAccrualAggregate(rowCount: number): WildberriesAccrualAggregate {
  return {
    rowCount,
    sumByGroup: new Map<string, number>(),
    sumByDate: new Map<string, number>(),
    sumByDateAndReason: new Map<string, Map<string, number>>(),
    salesDateRangeMap: new Map<string, number>(),
    groupTypeBreakdown: new Map<string, Map<string, number>>(),
    salesRevenueByScheme: createSalesSchemeMap(),
    salesTransferByScheme: createSalesSchemeMap(),
    wbCommissionAmount: 0,
    logisticsAmount: 0,
    paymentServicesAmount: 0,
    storageAmount: 0,
    withholdingsAmount: 0,
    acceptanceOperationsAmount: 0,
    finesAmount: 0,
    vvCorrectionAmount: 0,
    pvzCompensationAmount: 0,
    transportReimbursementAmount: 0,
    salesQuantity: 0,
    returnsAndCancellationsQuantity: 0,
    returnsAmount: 0,
    revenueBeforeSpp: 0,
    revenueWithoutSpp: 0,
    payoutForSoldItems: 0,
    logisticsForSoldItems: 0,
    storageForSoldItems: 0,
    withholdingsForSoldItems: 0,
    acceptanceOperationsForSoldItems: 0,
    finesForSoldItems: 0,
    cogsFromFile: 0,
    cogsMatchedRows: 0,
  }
}

function aggregateWildberriesAccrualRows(
  rows: WbRow[],
  cogsByArticleMap: CogsByArticleMap | null,
  cogsMatchingMode: CogsMatchingMode,
): WildberriesAccrualAggregate {
  const aggregate = createWildberriesAccrualAggregate(rows.length)
  const { schemeBySrid, schemeByBasketId } = buildSalesSchemeLookups(rows)

  for (const row of rows) {
    const reason = row.reason || 'Без обоснования'
    const amount = getRowAmount(row)
    const reasonLower = normalizeLower(reason)

    if (reasonLower === 'продажа') {
      aggregate.salesQuantity += row.quantity
      const saleRevenue = row.retailPrice
      aggregate.revenueBeforeSpp += saleRevenue
      aggregate.revenueWithoutSpp += row.sellerRealized
      aggregate.payoutForSoldItems += row.payout
      aggregate.logisticsForSoldItems += absValue(row.logisticsCost)
      aggregate.storageForSoldItems += absValue(row.storageCost)
      aggregate.withholdingsForSoldItems += absValue(row.withholdings)
      aggregate.acceptanceOperationsForSoldItems += absValue(row.acceptanceOperations)
      aggregate.finesForSoldItems += absValue(row.fines)

      const saleDate = row.salesDate || 'Без даты'
      addToNumberMap(aggregate.salesDateRangeMap, saleDate, 0)
      const salesScheme = resolveSalesScheme(row, schemeBySrid, schemeByBasketId)
      addToNumberMap(aggregate.salesRevenueByScheme, salesScheme, saleRevenue)
      addToNumberMap(aggregate.salesTransferByScheme, salesScheme, row.payout)

      if (cogsByArticleMap && cogsByArticleMap.size > 0) {
        const articleKey = resolveCogsLookupKey(row.article, cogsMatchingMode)
        const unitCogs = cogsByArticleMap.get(articleKey)
        if (articleKey && unitCogs !== undefined) {
          aggregate.cogsFromFile += row.quantity * unitCogs
          aggregate.cogsMatchedRows += 1
        }
      }
    }

    aggregate.logisticsAmount += absValue(row.logisticsCost)
    aggregate.paymentServicesAmount += absValue(row.paymentServicesCommission)
    aggregate.storageAmount += absValue(row.storageCost)
    aggregate.withholdingsAmount += absValue(row.withholdings)
    aggregate.acceptanceOperationsAmount += absValue(row.acceptanceOperations)
    aggregate.finesAmount += absValue(row.fines)
    aggregate.vvCorrectionAmount += -row.vvCorrection
    aggregate.pvzCompensationAmount += absValue(row.pvzCompensation)
    aggregate.transportReimbursementAmount += absValue(row.transportReimbursement)

    if (reasonLower === 'возврат') {
      aggregate.returnsAmount += amount
    }

    aggregate.returnsAndCancellationsQuantity += row.returnCount
    addToNumberMap(aggregate.sumByGroup, reason, amount)

    const date = row.salesDate || 'Без даты'
    addToNumberMap(aggregate.sumByDate, date, amount)
    if (!aggregate.sumByDateAndReason.has(date)) {
      aggregate.sumByDateAndReason.set(date, new Map<string, number>())
    }
    addToNumberMap(aggregate.sumByDateAndReason.get(date)!, reason, amount)

    const breakdownType = row.logisticsKind || row.documentType || 'Без подтипа'
    if (!aggregate.groupTypeBreakdown.has(reason)) {
      aggregate.groupTypeBreakdown.set(reason, new Map<string, number>())
    }
    addToNumberMap(aggregate.groupTypeBreakdown.get(reason)!, breakdownType, amount)
  }

  aggregate.wbCommissionAmount = aggregate.revenueBeforeSpp - aggregate.payoutForSoldItems
  return aggregate
}

function getWildberriesMarketplaceExpenses(aggregate: WildberriesAccrualAggregate): number {
  return aggregate.wbCommissionAmount
    + aggregate.logisticsAmount
    + aggregate.paymentServicesAmount
    + aggregate.storageAmount
    + aggregate.withholdingsAmount
    + aggregate.acceptanceOperationsAmount
    + aggregate.finesAmount
    + aggregate.vvCorrectionAmount
    + aggregate.pvzCompensationAmount
    + aggregate.transportReimbursementAmount
}

function getWildberriesTransferToBank(aggregate: WildberriesAccrualAggregate): number {
  return aggregate.payoutForSoldItems
    - aggregate.logisticsForSoldItems
    - aggregate.storageForSoldItems
    - aggregate.acceptanceOperationsForSoldItems
    - aggregate.withholdingsForSoldItems
    - aggregate.finesForSoldItems
}

function buildWildberriesGroupedExpenseMetrics(
  aggregate: WildberriesAccrualAggregate,
  marketplaceExpenses: number,
  salesBase: number | null,
): AccrualMetric[] {
  const groupedByLabel = new Map<string, { value: number, withSalesShare: boolean, sourceLabels: Set<string> }>()
  for (const [rawLabel, value] of sortByAbsDesc(Array.from(aggregate.sumByGroup.entries()))) {
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
  if (hasNonZero(aggregate.wbCommissionAmount)) {
    groupedByLabel.set(WB_COMMISSION_LABEL, {
      value: -aggregate.wbCommissionAmount,
      withSalesShare: true,
      sourceLabels: new Set<string>(),
    })
  }
  if (hasNonZero(aggregate.paymentServicesAmount)) {
    groupedByLabel.set(PAYMENT_SERVICES_LABEL, {
      value: -aggregate.paymentServicesAmount,
      withSalesShare: true,
      sourceLabels: new Set<string>(),
    })
  }
  if (hasNonZero(aggregate.acceptanceOperationsAmount)) {
    groupedByLabel.set(ACCEPTANCE_OPERATIONS_LABEL, {
      value: -aggregate.acceptanceOperationsAmount,
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
          formula: `SUM("${WB_REVENUE_COLUMNS.retailPrice}") - SUM("${WB_REVENUE_COLUMNS.payout}")`,
          shareText: formatSharePercent(value, salesBase),
        }
      }
      if (label === PAYMENT_SERVICES_LABEL) {
        return {
          label,
          value,
          type: 'currency',
          formula: `-ABS(SUM("${WB_EXPENSE_COLUMNS.paymentServices}"))`,
          shareText: formatSharePercent(value, salesBase),
        }
      }
      if (label === ACCEPTANCE_OPERATIONS_LABEL) {
        return {
          label,
          value,
          type: 'currency',
          formula: `-ABS(SUM("${WB_EXPENSE_COLUMNS.acceptanceOperations}"))`,
          shareText: formatSharePercent(value, salesBase),
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
        shareText: data.withSalesShare ? formatSharePercent(value, salesBase) : null,
      }
    })

  groupMetrics.push({
    label: 'Итог',
    value: -Math.abs(marketplaceExpenses),
    type: 'currency',
    formula: MARKETPLACE_EXPENSES_FORMULA,
    shareText: formatSharePercent(marketplaceExpenses, salesBase),
  })
  return groupMetrics
}

function buildWildberriesSchemeMetrics(
  aggregate: WildberriesAccrualAggregate,
  transferToBank: number,
): AccrualMetric[] {
  const schemeRevenueTotal = getSalesSchemeTotal(aggregate.salesRevenueByScheme)
  const useRevenueAsSchemeBase = hasNonZero(schemeRevenueTotal)
  const rawSchemeMap = useRevenueAsSchemeBase ? aggregate.salesRevenueByScheme : aggregate.salesTransferByScheme
  const fallbackTransferTarget = hasNonZero(transferToBank)
    ? transferToBank
    : getSalesSchemeTotal(aggregate.salesTransferByScheme)
  const schemeMetricsMap = useRevenueAsSchemeBase
    ? rawSchemeMap
    : scaleSalesSchemeMap(rawSchemeMap, fallbackTransferTarget)

  return SALES_SCHEME_ORDER
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
}

function buildWildberriesStructureSummaries(groupTypeBreakdown: Map<string, Map<string, number>>): AccrualGroup[] {
  return Array.from(groupTypeBreakdown.entries())
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
}

function buildWildberriesDateMetrics(aggregate: WildberriesAccrualAggregate): AccrualMetric[] {
  const rubleIntegerFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
  return Array.from(aggregate.sumByDate.entries())
    .sort(([a], [b]) => {
      const aTime = toDateTimestamp(a)
      const bTime = toDateTimestamp(b)
      if (aTime === null && bTime === null) return a.localeCompare(b, 'ru')
      if (aTime === null) return 1
      if (bTime === null) return -1
      return aTime - bTime
    })
    .map(([dateLabel, value]) => {
      const reasonsByDate = aggregate.sumByDateAndReason.get(dateLabel)
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
    })
}

function buildWildberriesAccrualReportGroups(
  aggregate: WildberriesAccrualAggregate,
  vatRatePercent: number,
  taxRatePercent: number,
): AccrualGroup[] {
  const sppAndPromotions = aggregate.revenueBeforeSpp - aggregate.revenueWithoutSpp
  const returnsExpense = aggregate.returnsAmount === 0 ? 0 : -Math.abs(aggregate.returnsAmount)
  const marketplaceExpenses = getWildberriesMarketplaceExpenses(aggregate)
  const transferToBank = getWildberriesTransferToBank(aggregate)
  const totalRate = (vatRatePercent + taxRatePercent) / 100
  const taxAmount = aggregate.revenueBeforeSpp !== 0 ? aggregate.revenueBeforeSpp * totalRate : 0
  const cogs: number | null = aggregate.cogsMatchedRows > 0 ? aggregate.cogsFromFile : null
  const netProfit = transferToBank - taxAmount - (cogs ?? 0)
  const marginRate = aggregate.revenueBeforeSpp !== 0 ? (netProfit / aggregate.revenueBeforeSpp) * 100 : null
  const salesBase = aggregate.revenueBeforeSpp > 0 ? aggregate.revenueBeforeSpp : null

  return [
    {
      title: 'Итоги периода',
      rowCount: aggregate.rowCount,
      periodLabel: buildPeriodLabel(
        aggregate.salesDateRangeMap.size > 0 ? aggregate.salesDateRangeMap : aggregate.sumByDate,
      ),
      metrics: [
        {
          label: 'Количество продаж',
          value: aggregate.salesQuantity,
          type: 'number',
          formula: 'SUM("Кол-во"), фильтр: "Обоснование для оплаты" = "Продажа"',
        },
        {
          label: 'Отмены, возвраты, не выкупы',
          value: aggregate.returnsAndCancellationsQuantity,
          type: 'number',
          formula: 'SUM("Количество возврата")',
        },
        {
          label: 'Выручка с учетом СПП',
          value: aggregate.revenueBeforeSpp,
          type: 'currency',
          formula: 'SUM("Цена розничная"), фильтр: "Обоснование для оплаты" = "Продажа"',
        },
        {
          label: 'Выручка без СПП',
          value: aggregate.revenueWithoutSpp,
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
          shareText: formatSharePercent(marketplaceExpenses, salesBase),
        },
        {
          label: 'Перевод в банк',
          value: transferToBank,
          type: 'currency',
          formula: [
            'SUM("К перечислению за товар"), фильтр: "Обоснование для оплаты" = "Продажа"',
            `- ABS(SUM("${WB_EXPENSE_COLUMNS.logisticsToBuyer}")), фильтр: "Обоснование для оплаты" = "Продажа"`,
            `- ABS(SUM("${WB_EXPENSE_COLUMNS.storage}")), фильтр: "Обоснование для оплаты" = "Продажа"`,
            `- ABS(SUM("${WB_EXPENSE_COLUMNS.acceptanceOperations}")), фильтр: "Обоснование для оплаты" = "Продажа"`,
            `- ABS(SUM("${WB_EXPENSE_COLUMNS.withholdings}")), фильтр: "Обоснование для оплаты" = "Продажа"`,
            `- ABS(SUM("${WB_EXPENSE_COLUMNS.fines}")), фильтр: "Обоснование для оплаты" = "Продажа"`,
          ].join(' '),
        },
        {
          label: 'Себестоимость',
          value: cogs,
          type: 'currency',
          formula: cogs !== null
            ? 'SUM(Кол-во продаж * Себестоимость из загруженного CSV себестоимости)'
            : 'Нет данных: загрузите CSV с себестоимостью товаров',
          shareText: cogs !== null ? formatSharePercent(cogs, salesBase) : null,
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
      metrics: buildWildberriesGroupedExpenseMetrics(aggregate, marketplaceExpenses, salesBase),
    },
    {
      title: 'Схема работы',
      metrics: buildWildberriesSchemeMetrics(aggregate, transferToBank),
    },
    {
      title: 'Динамика по датам начисления',
      metrics: buildWildberriesDateMetrics(aggregate),
    },
    ...buildWildberriesStructureSummaries(aggregate.groupTypeBreakdown),
  ]
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
  const rows = parseCsv(stripBom(rawCsv), WB_CSV_LAYOUT.delimiter)
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === WB_CSV_LAYOUT.headerFirstCell
      && normalize(row[1]) === WB_CSV_LAYOUT.headerSecondCell,
  )
  if (headerIndex === -1) {
    throw new Error('Не найдена строка заголовков еженедельного отчета Wildberries.')
  }

  const table = createCsvTable(rows, headerIndex)
  const parsedRows = parseWildberriesRowsFromTable(table, articlePattern, excludePattern)
  const aggregate = aggregateWildberriesAccrualRows(parsedRows, cogsByArticleMap, cogsMatchingMode)

  return buildWildberriesAccrualReportGroups(aggregate, vatRatePercent, taxRatePercent)
}
