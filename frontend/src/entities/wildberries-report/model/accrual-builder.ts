import type { AccrualGroup, AccrualMetric, ValueType } from '@/shared/lib/report-types'
import { WB_BASE_COLUMNS, WB_CSV_LAYOUT, WB_EXPENSE_COLUMNS, WB_LOYALTY_COLUMNS, WB_QUANTITY_COLUMNS, WB_REVENUE_COLUMNS } from '@/entities/wildberries-report/model/columns'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'
import type { CsvTable } from '@/shared/lib/reporting'
import { addToNumberMap, assertCsvColumns, createCsvTable, formatSharePercent, isArticleIncludedByPattern, normalizeLower, sortByAbsDesc, stripBom, sumNumberMap } from '@/shared/lib/reporting'
import type { CogsByArticleMap, CogsMatchingMode } from '@/entities/wildberries-report/model/cogs-builder'
import { resolveCogsLookupKey } from '@/entities/wildberries-report/model/cogs-builder'
import { buildWildberriesNetEffectSumFormula, calculateWildberriesAcceptanceOperationsAmount, calculateWildberriesCogsFromFile, calculateWildberriesCogsMatchedRows, calculateWildberriesDiscountCompensation, calculateWildberriesFinesAmount, calculateWildberriesLogisticsAmount, calculateWildberriesPaymentServicesAmount, calculateWildberriesPvzCompensationAmount, calculateWildberriesReturnsAndCancellationsQuantity, calculateWildberriesReturnsNetEffect, calculateWildberriesReturnsQuantity, calculateWildberriesReturnsRevenueBeforeSpp, calculateWildberriesRevenueWithoutSpp, calculateWildberriesRowNetEffect, calculateWildberriesSalesAcceptanceOperationsAmount, calculateWildberriesSalesFinesAmount, calculateWildberriesSalesLogisticsAmount, calculateWildberriesSalesPayout, calculateWildberriesSalesQuantity, calculateWildberriesSalesRevenueBeforeSpp, calculateWildberriesSalesRevenueByRetailPrice, calculateWildberriesSalesStorageAmount, calculateWildberriesSalesWithholdingsAmount, calculateWildberriesStorageAmount, calculateWildberriesTransportReimbursementAmount, calculateWildberriesVoluntaryCompensation, calculateWildberriesVvCorrectionAmount, calculateWildberriesWbCommissionCalculated, calculateWildberriesWithholdingsAmount, isWildberriesSaleRow, WILDBERRIES_ACCRUAL_ATOM_FORMULAS } from '@/entities/wildberries-report/model/metrics/atoms'
import { buildWildberriesAccrualCells, getWildberriesMarginRateCellFormula, getWildberriesNetProfitCellFormula, getWildberriesTaxCellFormula, WILDBERRIES_ACCRUAL_CELL_FORMULAS, type WildberriesAccrualCells } from '@/entities/wildberries-report/model/metrics/cells'
import type { WildberriesAccrualMetricAtoms, WildberriesAccrualRow as WbRow, WildberriesSalesScheme as SalesScheme } from '@/entities/wildberries-report/model/metrics/types'

const SALES_SCHEME_ORDER: SalesScheme[] = ['FBS', 'FBW', 'Не указано']
const SALES_SCHEME_LABELS: Record<SalesScheme, string> = {
  FBS: 'FBS — склад продавца',
  FBW: 'FBW — склад ВБ',
  'Не указано': 'Не указано — нет обозначения склада в отчете',
}
const GROUPED_EXPENSES_REPORT_TITLE = 'Общие затраты по Маркетплейсу'
const WB_COMMISSION_LABEL = 'Комиссия ВБ'
const LOGISTICS_LABEL = 'Логистика'
const ADVERTISING_LABEL = 'Продвижение'
const PAYMENT_SERVICES_LABEL = 'Эквайринг'
const STORAGE_LABEL = 'Хранение ФБО'
const FINES_LABEL = 'Штрафы'
const ACCEPTANCE_OPERATIONS_LABEL = 'Операции на приемке'
const VOLUNTARY_COMPENSATION_LABEL = 'Добровольная компенсация'
const DISCOUNT_COMPENSATION_LABEL = 'Компенсация скидки'
const TOTAL_EXPENSES_LABEL = 'Итого расходов'
const TOTAL_COMPENSATIONS_LABEL = 'Итого компенсаций'
const TOTAL_NET_LABEL = 'Итого с учётом компенсаций'

/**
 * Проверяет наличие ненулевой суммы.
 * Используется презентационными группами WB, чтобы не показывать пустые расчетные строки.
 */
function hasNonZero(value: number): boolean {
  return Math.abs(value) > 0
}

/**
 * Создает карту схем продаж с нулевыми значениями для FBS/FBW/не указано.
 * Используется при накоплении и масштабировании метрик группы `Схема работы`.
 */
function createSalesSchemeMap(): Map<SalesScheme, number> {
  return new Map(SALES_SCHEME_ORDER.map((scheme) => [scheme, 0] as const))
}

/**
 * Суммирует значения карты схем продаж.
 * Используется для выбора базы `Схема работы`: выручка по схеме или fallback от перевода в банк.
 */
function getSalesSchemeTotal(map: Map<SalesScheme, number>): number {
  return sumNumberMap(map)
}

/**
 * Масштабирует распределение схем продаж до целевой суммы.
 * Используется, когда нет надежной выручки по схемам и нужно разложить `Перевод в банк`.
 */
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

/**
 * Извлекает FBS/FBW из колонки `Способы продажи и тип товара`.
 * Используется прямым определением схемы перед fallback-поиском по связанным строкам.
 */
function detectSalesSchemeByMethod(rawSalesMethod: string): SalesScheme | null {
  const normalized = normalizeLower(rawSalesMethod)
  if (!normalized) return null
  if (normalized.includes('fbs')) return 'FBS'
  if (normalized.includes('fbw') || normalized.includes('fbo')) return 'FBW'
  return null
}

/**
 * Определяет схему продажи для строки: напрямую, через Srid/Id корзины или по складу.
 * Используется при накоплении `salesRevenueByScheme` и `salesTransferByScheme`.
 */
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

/**
 * Преобразует дату WB из строки в timestamp для сортировки.
 * Используется периодом отчета и группой `Динамика по датам начисления`.
 */
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

/**
 * Собирает подпись периода по минимальной и максимальной дате продаж.
 * Используется в группе `Итоги периода`.
 */
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

/**
 * Превращает пары `label/value` в стандартные `AccrualMetric`.
 * Используется для структуры списаний, где метрики строятся однотипно.
 */
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

/**
 * Формирует полное условие по колонке `Обоснование для оплаты` для tooltip-формул.
 * Используется группой расходов и структурами расчета.
 */
function buildReasonFilterFormula(sourceLabels: string[]): string {
  if (sourceLabels.length === 1) return `"${WB_BASE_COLUMNS.reason}" = "${sourceLabels[0]}"`
  return `"${WB_BASE_COLUMNS.reason}" IN (${sourceLabels.map((item) => `"${item}"`).join(', ')})`
}

/**
 * Формирует условие подтипа структуры по колонкам логистики/документа.
 * Используется блоком `Сруктура расчета`.
 */
function buildBreakdownTypeFilterFormula(label: string): string {
  return `COALESCE(NULLIF("${WB_BASE_COLUMNS.logisticsKind}", ""), NULLIF("${WB_BASE_COLUMNS.documentType}", ""), "Без подтипа") = "${label}"`
}

type WildberriesAccrualAggregate = {
  rowCount: number
  metricAtoms: WildberriesAccrualMetricAtoms
  sumByGroup: Map<string, number>
  sumByDate: Map<string, number>
  sumByDateAndReason: Map<string, Map<string, number>>
  salesDateRangeMap: Map<string, number>
  groupTypeBreakdown: Map<string, Map<string, number>>
  salesRevenueByScheme: Map<SalesScheme, number>
  salesTransferByScheme: Map<SalesScheme, number>
}

/**
 * Валидирует обязательные колонки WB CSV и нормализует строки в доменную модель `WbRow`.
 * Используется публичным builder-ом перед расчетом атомов и группировок.
 */
function parseWildberriesRowsFromTable(
  table: CsvTable,
  articlePattern: string,
  excludePattern: boolean,
  priceMin: number | null = null,
  priceMax: number | null = null,
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
    WB_EXPENSE_COLUMNS.wbCommissionRate,
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
    .filter((row) => {
      if (priceMin === null && priceMax === null) return true
      const retailPrice = parseNumber(table.getCell(row, WB_REVENUE_COLUMNS.retailPriceWithDiscount))
      if (retailPrice === null) return false
      if (priceMin !== null && retailPrice < priceMin) return false
      if (priceMax !== null && retailPrice > priceMax) return false
      return true
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
      wbCommissionRate: parseNumber(table.getCell(row, WB_EXPENSE_COLUMNS.wbCommissionRate)) ?? 0,
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

/**
 * Собирает объект атомов через чистые atom-функции.
 * Используется builder-ом как слой оркестрации перед molecules/cells.
 */
function buildWildberriesAccrualMetricAtoms(
  rows: WbRow[],
  cogsByArticleMap: CogsByArticleMap | null,
  cogsMatchingMode: CogsMatchingMode,
): WildberriesAccrualMetricAtoms {
  const resolveUnitCogs = (row: WbRow): number | null => {
    if (!cogsByArticleMap || cogsByArticleMap.size === 0) return null
    const articleKey = resolveCogsLookupKey(row.article, cogsMatchingMode)
    return articleKey ? cogsByArticleMap.get(articleKey) ?? null : null
  }

  return {
    salesQuantity: calculateWildberriesSalesQuantity(rows),
    returnsAndCancellationsQuantity: calculateWildberriesReturnsAndCancellationsQuantity(rows),
    returnsQuantity: calculateWildberriesReturnsQuantity(rows),
    salesRevenueByRetailPrice: calculateWildberriesSalesRevenueByRetailPrice(rows),
    salesRevenueBeforeSpp: calculateWildberriesSalesRevenueBeforeSpp(rows),
    returnsRevenueBeforeSpp: calculateWildberriesReturnsRevenueBeforeSpp(rows),
    revenueWithoutSpp: calculateWildberriesRevenueWithoutSpp(rows),
    salesPayout: calculateWildberriesSalesPayout(rows),
    wbCommissionCalculated: calculateWildberriesWbCommissionCalculated(rows),
    returnsNetEffect: calculateWildberriesReturnsNetEffect(rows),
    logisticsAmount: calculateWildberriesLogisticsAmount(rows),
    paymentServicesAmount: calculateWildberriesPaymentServicesAmount(rows),
    storageAmount: calculateWildberriesStorageAmount(rows),
    withholdingsAmount: calculateWildberriesWithholdingsAmount(rows),
    acceptanceOperationsAmount: calculateWildberriesAcceptanceOperationsAmount(rows),
    finesAmount: calculateWildberriesFinesAmount(rows),
    vvCorrectionAmount: calculateWildberriesVvCorrectionAmount(rows),
    pvzCompensationAmount: calculateWildberriesPvzCompensationAmount(rows),
    transportReimbursementAmount: calculateWildberriesTransportReimbursementAmount(rows),
    voluntaryCompensation: calculateWildberriesVoluntaryCompensation(rows),
    discountCompensation: calculateWildberriesDiscountCompensation(rows),
    salesLogisticsAmount: calculateWildberriesSalesLogisticsAmount(rows),
    salesStorageAmount: calculateWildberriesSalesStorageAmount(rows),
    salesWithholdingsAmount: calculateWildberriesSalesWithholdingsAmount(rows),
    salesAcceptanceOperationsAmount: calculateWildberriesSalesAcceptanceOperationsAmount(rows),
    salesFinesAmount: calculateWildberriesSalesFinesAmount(rows),
    cogsFromFile: calculateWildberriesCogsFromFile(rows, resolveUnitCogs),
    cogsMatchedRows: calculateWildberriesCogsMatchedRows(rows, resolveUnitCogs),
  }
}

/**
 * Строит lookup-и FBS/FBW по `Srid` и `Id корзины заказа`.
 * Используется в `resolveSalesScheme`, чтобы строки без прямого признака схемы наследовали схему связанной продажи.
 */
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

/**
 * Создает пустой агрегат WB accrual: атомы метрик, группировки, даты и схемы продаж.
 * Используется перед единым проходом по нормализованным строкам отчета.
 */
function createWildberriesAccrualAggregate(
  rowCount: number,
  metricAtoms: WildberriesAccrualMetricAtoms,
): WildberriesAccrualAggregate {
  return {
    rowCount,
    metricAtoms,
    sumByGroup: new Map<string, number>(),
    sumByDate: new Map<string, number>(),
    sumByDateAndReason: new Map<string, Map<string, number>>(),
    salesDateRangeMap: new Map<string, number>(),
    groupTypeBreakdown: new Map<string, Map<string, number>>(),
    salesRevenueByScheme: createSalesSchemeMap(),
    salesTransferByScheme: createSalesSchemeMap(),
  }
}

/**
 * Делает основной проход по строкам WB: накапливает atoms, `net effect`, даты, структуру и схемы.
 * Используется как расчетное ядро перед сборкой cells и отчетных групп.
 */
function aggregateWildberriesAccrualRows(
  rows: WbRow[],
  cogsByArticleMap: CogsByArticleMap | null,
  cogsMatchingMode: CogsMatchingMode,
): WildberriesAccrualAggregate {
  const metricAtoms = buildWildberriesAccrualMetricAtoms(rows, cogsByArticleMap, cogsMatchingMode)
  const aggregate = createWildberriesAccrualAggregate(rows.length, metricAtoms)
  const { schemeBySrid, schemeByBasketId } = buildSalesSchemeLookups(rows)

  for (const row of rows) {
    const reason = row.reason || 'Без обоснования'
    const amount = calculateWildberriesRowNetEffect(row)

    if (isWildberriesSaleRow(row)) {
      const saleRevenue = row.retailPrice

      const saleDate = row.salesDate || 'Без даты'
      addToNumberMap(aggregate.salesDateRangeMap, saleDate, 0)
      const salesScheme = resolveSalesScheme(row, schemeBySrid, schemeByBasketId)
      addToNumberMap(aggregate.salesRevenueByScheme, salesScheme, saleRevenue)
      addToNumberMap(aggregate.salesTransferByScheme, salesScheme, row.payout)
    }

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

  return aggregate
}

/**
 * Собирает группу `Общие затраты по Маркетплейсу` из `net effect` и расчетных expense cells.
 * Используется презентационным слоем WB accrual после построения итоговых cells.
 */
function buildWildberriesGroupedExpenseMetrics(
  aggregate: WildberriesAccrualAggregate,
  cells: WildberriesAccrualCells,
): AccrualMetric[] {
  const atoms = aggregate.metricAtoms

  const expenseItems: AccrualMetric[] = []
  if (hasNonZero(cells.wbCommissionAmount)) {
    expenseItems.push({
      label: WB_COMMISSION_LABEL,
      value: -cells.wbCommissionAmount,
      type: 'currency',
      formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.wbCommissionAmount,
      shareText: formatSharePercent(-cells.wbCommissionAmount, cells.salesBase),
    })
  }
  if (hasNonZero(atoms.logisticsAmount)) {
    expenseItems.push({
      label: LOGISTICS_LABEL,
      value: -atoms.logisticsAmount,
      type: 'currency',
      formula: `-(${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.logisticsAmount})`,
      shareText: formatSharePercent(-atoms.logisticsAmount, cells.salesBase),
    })
  }
  if (hasNonZero(atoms.withholdingsAmount)) {
    expenseItems.push({
      label: ADVERTISING_LABEL,
      value: -atoms.withholdingsAmount,
      type: 'currency',
      formula: `-(${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.withholdingsAmount})`,
      shareText: formatSharePercent(-atoms.withholdingsAmount, cells.salesBase),
    })
  }
  if (hasNonZero(atoms.paymentServicesAmount)) {
    expenseItems.push({
      label: PAYMENT_SERVICES_LABEL,
      value: -atoms.paymentServicesAmount,
      type: 'currency',
      formula: `-(${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.paymentServicesAmount})`,
      shareText: formatSharePercent(-atoms.paymentServicesAmount, cells.salesBase),
    })
  }
  if (hasNonZero(atoms.storageAmount)) {
    expenseItems.push({
      label: STORAGE_LABEL,
      value: -atoms.storageAmount,
      type: 'currency',
      formula: `-(${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.storageAmount})`,
      shareText: formatSharePercent(-atoms.storageAmount, cells.salesBase),
    })
  }
  if (hasNonZero(atoms.finesAmount)) {
    expenseItems.push({
      label: FINES_LABEL,
      value: -atoms.finesAmount,
      type: 'currency',
      formula: `-(${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.finesAmount})`,
      shareText: formatSharePercent(-atoms.finesAmount, cells.salesBase),
    })
  }
  if (hasNonZero(atoms.acceptanceOperationsAmount)) {
    expenseItems.push({
      label: ACCEPTANCE_OPERATIONS_LABEL,
      value: -atoms.acceptanceOperationsAmount,
      type: 'currency',
      formula: `-(${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.acceptanceOperationsAmount})`,
      shareText: formatSharePercent(-atoms.acceptanceOperationsAmount, cells.salesBase),
    })
  }

  const compensationItems: AccrualMetric[] = []
  if (hasNonZero(atoms.voluntaryCompensation)) {
    compensationItems.push({
      label: VOLUNTARY_COMPENSATION_LABEL,
      value: atoms.voluntaryCompensation,
      type: 'currency',
      formula: WILDBERRIES_ACCRUAL_ATOM_FORMULAS.voluntaryCompensation,
      shareText: formatSharePercent(atoms.voluntaryCompensation, cells.salesBase),
    })
  }
  if (hasNonZero(atoms.discountCompensation)) {
    compensationItems.push({
      label: DISCOUNT_COMPENSATION_LABEL,
      value: atoms.discountCompensation,
      type: 'currency',
      formula: WILDBERRIES_ACCRUAL_ATOM_FORMULAS.discountCompensation,
      shareText: formatSharePercent(atoms.discountCompensation, cells.salesBase),
    })
  }

  const marketplaceExpensesGross = cells.marketplaceExpenses
  const marketplaceCompensations = atoms.voluntaryCompensation + atoms.discountCompensation
  const marketplaceExpensesNet = marketplaceExpensesGross - marketplaceCompensations

  const reorderedMetrics: AccrualMetric[] = [
    ...sortByAbsDesc(expenseItems.map((m) => [m.label, m.value] as [string, number])).map(([label]) =>
      expenseItems.find((m) => m.label === label)!,
    ),
    {
      label: TOTAL_EXPENSES_LABEL,
      value: -Math.abs(marketplaceExpensesGross),
      type: 'currency',
      formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.marketplaceExpenses,
      shareText: formatSharePercent(marketplaceExpensesGross, cells.salesBase),
    },
    ...compensationItems,
    {
      label: TOTAL_COMPENSATIONS_LABEL,
      value: marketplaceCompensations,
      type: 'currency',
      formula: `${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.voluntaryCompensation} + ${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.discountCompensation}`,
      shareText: formatSharePercent(marketplaceCompensations, cells.salesBase),
    },
    {
      label: TOTAL_NET_LABEL,
      value: -Math.abs(marketplaceExpensesNet),
      type: 'currency',
      formula: `${TOTAL_EXPENSES_LABEL} + ${TOTAL_COMPENSATIONS_LABEL}`,
      shareText: formatSharePercent(marketplaceExpensesNet, cells.salesBase),
    },
  ]
  return reorderedMetrics
}

/**
 * Собирает группу `Схема работы` по FBS/FBW.
 * Используется в отчете для разложения продаж или transfer fallback по модели выполнения.
 */
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
        ? `${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.salesRevenueByRetailPrice}, фильтр модели ${scheme}: "${WB_BASE_COLUMNS.salesMethod}" содержит FBS/FBW или связанная строка по "${WB_BASE_COLUMNS.srid}" / "${WB_BASE_COLUMNS.basketId}" содержит модель; fallback FBS если "${WB_BASE_COLUMNS.warehouse}" содержит "склад поставщика".`
        : `${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.salesPayout}, фильтр модели ${scheme}: "${WB_BASE_COLUMNS.salesMethod}" содержит FBS/FBW или связанная строка по "${WB_BASE_COLUMNS.srid}" / "${WB_BASE_COLUMNS.basketId}" содержит модель; fallback FBS если "${WB_BASE_COLUMNS.warehouse}" содержит "склад поставщика". Значение масштабируется пропорционально к формуле "Перевод в банк": ${WILDBERRIES_ACCRUAL_CELL_FORMULAS.transferToBank}.`,
    }))
}

/**
 * Собирает группы `Структура: ...` с топ-подтипами списаний внутри каждого основания оплаты.
 * Используется для детализации крупных групп расходов и корректировок.
 */
function buildWildberriesStructureSummaries(groupTypeBreakdown: Map<string, Map<string, number>>): AccrualGroup[] {
  return Array.from(groupTypeBreakdown.entries())
    .map(([group, types]) => {
      const topTypes = sortByAbsDesc(Array.from(types.entries())).slice(0, 3)
      const groupTotal = Array.from(types.values()).reduce((acc, value) => acc + value, 0)
      return {
        title: `Структура: ${group}`,
        metrics: toMetrics(
          topTypes,
          (label) => buildWildberriesNetEffectSumFormula([
            buildReasonFilterFormula([group]),
            buildBreakdownTypeFilterFormula(label),
          ]),
        ),
        total: groupTotal,
      }
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map(({ title, metrics }) => ({ title, metrics }))
}

/**
 * Собирает метрики динамики по датам на базе `SUM(net effect)`.
 * Используется группой `Динамика по датам начисления`.
 */
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
          ? `${buildWildberriesNetEffectSumFormula([`"${WB_BASE_COLUMNS.salesDate}" = "${dateLabel}"`])}. Справа показано крупнейшее списание по "${WB_BASE_COLUMNS.reason}": "${topNegativeReason}".`
          : buildWildberriesNetEffectSumFormula([`"${WB_BASE_COLUMNS.salesDate}" = "${dateLabel}"`]),
      }
    })
}

/**
 * Собирает финальный набор групп WB accrual из агрегата, atoms/molecules/cells и презентационных секций.
 * Используется публичной функцией `buildWildberriesAccrualReports`.
 */
function buildWildberriesAccrualReportGroups(
  aggregate: WildberriesAccrualAggregate,
  vatRatePercent: number,
  taxRatePercent: number,
): AccrualGroup[] {
  const cells = buildWildberriesAccrualCells(aggregate.metricAtoms, vatRatePercent, taxRatePercent)

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
          value: cells.salesQuantity,
          type: 'number',
          formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.salesQuantity,
        },
        {
          label: 'Отмены и не выкупы',
          value: cells.cancellationsAndNonPickupsQuantity,
          type: 'number',
          formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.cancellationsAndNonPickupsQuantity,
        },
        {
          label: 'Возвраты',
          value: cells.returnsQuantity,
          type: 'count',
          formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.returnsQuantity,
        },
        {
          label: 'Выручка с учетом СПП',
          value: cells.revenueBeforeSpp,
          type: 'currency',
          formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.revenueBeforeSpp,
        },
        {
          label: 'Выручка без СПП',
          value: cells.revenueWithoutSpp,
          type: 'currency',
          formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.revenueWithoutSpp,
        },
        {
          label: 'СПП и акции',
          value: cells.sppAndPromotions,
          type: 'currency',
          formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.sppAndPromotions,
          shareText: formatSharePercent(cells.sppAndPromotions, cells.revenueBeforeSpp),
        },
        {
          label: 'Общие затраты по Маркетплейсу',
          value: cells.marketplaceExpenses,
          type: 'currency',
          formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.marketplaceExpenses,
          shareText: formatSharePercent(cells.marketplaceExpenses, cells.salesBase),
        },
        {
          label: 'Перевод в банк',
          value: cells.transferToBank,
          type: 'currency',
          formula: WILDBERRIES_ACCRUAL_CELL_FORMULAS.transferToBank,
        },
        {
          label: 'Себестоимость',
          value: cells.cogs,
          type: 'currency',
          formula: cells.cogs !== null
            ? WILDBERRIES_ACCRUAL_CELL_FORMULAS.cogsWithData
            : WILDBERRIES_ACCRUAL_CELL_FORMULAS.cogsWithoutData,
          shareText: cells.cogs !== null ? formatSharePercent(cells.cogs, cells.salesBase) : null,
        },
        {
          label: 'Налог',
          value: cells.taxAmount,
          type: 'currency',
          formula: getWildberriesTaxCellFormula(vatRatePercent, taxRatePercent),
        },
        {
          label: 'Маржинальность',
          value: cells.marginRate,
          type: 'percent',
          formula: getWildberriesMarginRateCellFormula(cells.cogs !== null, vatRatePercent, taxRatePercent),
        },
        {
          label: 'Чистая прибыль',
          value: cells.netProfit,
          type: 'currency',
          formula: getWildberriesNetProfitCellFormula(cells.cogs !== null, vatRatePercent, taxRatePercent),
        },
      ],
    },
    {
      title: GROUPED_EXPENSES_REPORT_TITLE,
      metrics: buildWildberriesGroupedExpenseMetrics(aggregate, cells),
    },
    {
      title: 'Схема работы',
      metrics: buildWildberriesSchemeMetrics(aggregate, cells.transferToBank),
    },
    {
      title: 'Динамика по датам начисления',
      metrics: buildWildberriesDateMetrics(aggregate),
    },
    ...buildWildberriesStructureSummaries(aggregate.groupTypeBreakdown),
  ]
}

/**
 * Публичная точка построения WB accrual-отчета из CSV.
 * Используется UI/фичами импорта: парсит CSV, строит агрегат и возвращает готовые `AccrualGroup[]`.
 */
export function buildWildberriesAccrualReports(
  rawCsv: string,
  vatRatePercent = 5,
  taxRatePercent = 6,
  articlePattern = '*',
  cogsByArticleMap: CogsByArticleMap | null = null,
  cogsMatchingMode: CogsMatchingMode = 'full',
  excludePattern = false,
  priceMin: number | null = null,
  priceMax: number | null = null,
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
  const parsedRows = parseWildberriesRowsFromTable(table, articlePattern, excludePattern, priceMin, priceMax)
  const aggregate = aggregateWildberriesAccrualRows(parsedRows, cogsByArticleMap, cogsMatchingMode)

  return buildWildberriesAccrualReportGroups(aggregate, vatRatePercent, taxRatePercent)
}
