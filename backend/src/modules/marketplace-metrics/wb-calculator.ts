import { createHash } from 'node:crypto'

export type WbMetricFilters = {
  articlePattern: string
  excludeArticlePattern: boolean
  priceMin: number | null
  priceMax: number | null
}

export type WbMetricParams = {
  vatRatePercent: number
  taxRatePercent: number
  cogsMatchingMode: 'full' | 'digits'
}

export type WbAccrualRow = {
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
  retailAmount: number
  payout: number
  logisticsCost: number
  wbCommissionRate: number
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

export type WbMetricAtoms = {
  salesQuantity: number
  returnsAndCancellationsQuantity: number
  returnsQuantity: number
  salesRevenueByRetailPrice: number
  salesRevenueBeforeSpp: number
  returnsRevenueBeforeSpp: number
  revenueWithoutSpp: number
  salesPayout: number
  wbCommissionCalculated: number
  returnsNetEffect: number
  logisticsAmount: number
  paymentServicesAmount: number
  storageAmount: number
  withholdingsAmount: number
  acceptanceOperationsAmount: number
  finesAmount: number
  vvCorrectionAmount: number
  pvzCompensationAmount: number
  transportReimbursementAmount: number
  voluntaryCompensation: number
  discountCompensation: number
  salesLogisticsAmount: number
  salesStorageAmount: number
  salesWithholdingsAmount: number
  salesAcceptanceOperationsAmount: number
  salesFinesAmount: number
  cogsFromFile: number
  cogsMatchedRows: number
}

export type WbMetricCells = {
  salesQuantity: number
  cancellationsAndNonPickupsQuantity: number
  returnsQuantity: number
  revenueBeforeSpp: number
  revenueWithoutSpp: number
  sppAndPromotions: number
  wbCommissionAmount: number
  marketplaceExpenses: number
  transferToBank: number
  cogs: number | null
  taxAmount: number
  marginRate: number | null
  netProfit: number
  salesBase: number | null
}

export type WbMetricBreakdowns = {
  expenses: Array<{ label: string; value: number; shareText: string | null }>
  salesScheme: Array<{ label: string; value: number }>
  dailyDynamics: Array<{ label: string; value: number; shareText: string | null }>
  reasonStructure: Array<{ title: string; metrics: Array<{ label: string; value: number }> }>
}

export type WbMetricsResult = {
  rowCount: number
  atoms: WbMetricAtoms
  molecules: Record<string, number | null>
  cells: WbMetricCells
  breakdowns: WbMetricBreakdowns
  dataQuality: {
    cogsMatchedRows: number
    missingCogsArticles: string[]
    warnings: string[]
  }
  reportGroups: Array<{
    title: string
    rowCount?: number
    periodLabel?: string
    metrics: Array<{ label: string; value: number | null; type: 'number' | 'count' | 'currency' | 'percent'; shareText?: string | null }>
  }>
}

const SALE_REASON = 'продажа'
const RETURN_REASON = 'возврат'
const FULFILLMENT_SCHEME_ORDER = ['fbs', 'fbm', 'unknown'] as const
const WB_FULFILLMENT_SCHEME_LABELS: Record<FulfillmentScheme, string> = {
  fbs: 'FBS — склад продавца',
  fbm: 'FBW — склад ВБ',
  unknown: 'Не указано',
}

type FulfillmentScheme = typeof FULFILLMENT_SCHEME_ORDER[number]

function normalize(value: unknown): string {
  return String(value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeLower(value: unknown): string {
  return normalize(value).toLowerCase()
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = normalize(value)
    .replace(/[₽%]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return 0
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatApiDateToCsvStyle(raw: unknown): string {
  const value = normalize(raw)
  if (!value) return ''
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return value
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ts))
}

export function mapWbApiRowToAccrualRow(api: Record<string, unknown>): WbAccrualRow {
  return {
    article: normalize(api.vendorCode),
    documentType: normalize(api.docTypeName),
    reason: normalize(api.sellerOperName),
    salesDate: formatApiDateToCsvStyle(api.saleDt),
    salesMethod: normalize(api.deliveryMethod),
    warehouse: normalize(api.officeName),
    basketId: normalize(api.orderUid),
    srid: normalize(api.srid),
    logisticsKind: normalize(api.bonusTypeName),
    quantity: parseNumber(api.quantity),
    returnCount: parseNumber(api.returnAmount),
    deliveryCount: parseNumber(api.deliveryAmount),
    retailPrice: parseNumber(api.retailPrice),
    retailPriceWithDiscount: parseNumber(api.retailPriceWithDisc),
    retailAmount: parseNumber(api.retailAmount),
    payout: parseNumber(api.forPay),
    logisticsCost: parseNumber(api.deliveryService),
    wbCommissionRate: parseNumber(api.commissionPercent),
    wbCommission: parseNumber(api.vw),
    paymentServicesCommission: parseNumber(api.acquiringFee),
    pvzCompensation: parseNumber(api.ppvzReward),
    transportReimbursement: parseNumber(api.rebillLogisticCost),
    storageCost: parseNumber(api.paidStorage),
    withholdings: parseNumber(api.deduction),
    acceptanceOperations: parseNumber(api.paidAcceptance),
    fines: parseNumber(api.penalty),
    vvCorrection: parseNumber(api.additionalPayment),
    loyaltyCompensation: parseNumber(api.cashbackDiscount),
    loyaltyProgramCost: parseNumber(api.cashbackCommissionChange),
    loyaltyPointsWithheld: parseNumber(api.cashbackAmount),
  }
}

function normalizeArticleKey(article: string): string {
  return normalize(article).toLowerCase()
}

function resolveCogsLookupKey(article: string, mode: 'full' | 'digits'): string {
  const normalized = normalizeArticleKey(article)
  if (mode === 'digits') {
    const digits = normalized.replace(/\D/g, '')
    if (digits) return `digits:${digits}`
  }
  return `full:${normalized}`
}

function matchesPattern(value: string, pattern: string, exclude: boolean): boolean {
  const normalizedPattern = normalize(pattern || '*')
  if (!normalizedPattern || normalizedPattern === '*') return !exclude
  const escaped = normalizedPattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  const regex = new RegExp(`^${escaped}$`, 'i')
  const matched = regex.test(value)
  return exclude ? !matched : matched
}

function isSale(row: WbAccrualRow): boolean {
  return normalizeLower(row.reason) === SALE_REASON
}

function isReturn(row: WbAccrualRow): boolean {
  return normalizeLower(row.reason) === RETURN_REASON
}

function abs(value: number): number {
  return Math.abs(value)
}

function hasNonZero(value: number): boolean {
  return Math.abs(value) > 0
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}

function pickSignedAmount(payout: number, fallback: number, expected: 'negative' | 'positive' | 'any'): number {
  if (hasNonZero(payout)) return payout
  if (!hasNonZero(fallback)) return 0
  if (expected === 'negative') return fallback > 0 ? -fallback : fallback
  if (expected === 'positive') return fallback < 0 ? -fallback : fallback
  return fallback
}

function calculateRowNetEffect(row: WbAccrualRow): number {
  const reason = normalizeLower(row.reason)
  const payout = row.payout

  if (reason === SALE_REASON || reason === RETURN_REASON) return payout
  if (reason === 'компенсация скидки по программе лояльности') {
    const loyaltyAmount = abs(row.loyaltyCompensation) - abs(row.loyaltyProgramCost) - abs(row.loyaltyPointsWithheld)
    return hasNonZero(loyaltyAmount) ? loyaltyAmount : payout
  }
  if (includesAny(reason, ['логистика', 'коррекция логистики'])) return pickSignedAmount(payout, abs(row.logisticsCost), 'negative')
  if (reason === 'возмещение за выдачу и возврат товаров на пвз') return pickSignedAmount(payout, abs(row.pvzCompensation), 'negative')
  if (reason === 'возмещение издержек по перевозке/по складским операциям с товаром') return pickSignedAmount(payout, abs(row.transportReimbursement), 'negative')
  if (reason === 'хранение') return pickSignedAmount(payout, abs(row.storageCost), 'negative')
  if (reason === 'обработка товара') return pickSignedAmount(payout, abs(row.withholdings) + abs(row.acceptanceOperations), 'negative')
  if (includesAny(reason, ['удержан', 'услуга платной доставки', 'бронирование товара через самовывоз', 'разовое изменение срока перечисления'])) return pickSignedAmount(payout, abs(row.withholdings), 'negative')
  if (reason === 'штраф') return pickSignedAmount(payout, abs(row.fines), 'negative')
  if (includesAny(reason, ['компенсация ущерба', 'добровольная компенсация при возврате'])) return pickSignedAmount(payout, 0, 'positive')
  if (includesAny(reason, ['коррекция продаж', 'коррекция эквайринга'])) return pickSignedAmount(payout, row.vvCorrection, 'any')
  if (reason === 'стоимость участия в программе лояльности') return pickSignedAmount(payout, abs(row.loyaltyProgramCost), 'negative')
  if (reason === 'сумма удержанная за начисленные баллы программы лояльности') return pickSignedAmount(payout, abs(row.loyaltyPointsWithheld), 'negative')
  if (hasNonZero(payout)) return payout

  return row.vvCorrection
    + abs(row.loyaltyCompensation)
    - abs(row.loyaltyProgramCost)
    - abs(row.loyaltyPointsWithheld)
    - abs(row.logisticsCost)
    - abs(row.paymentServicesCommission)
    - abs(row.pvzCompensation)
    - abs(row.transportReimbursement)
    - abs(row.storageCost)
    - abs(row.withholdings)
    - abs(row.acceptanceOperations)
    - abs(row.fines)
}

function sum(rows: WbAccrualRow[], getValue: (row: WbAccrualRow) => number, predicate: (row: WbAccrualRow) => boolean = () => true): number {
  return rows.reduce((acc, row) => (predicate(row) ? acc + getValue(row) : acc), 0)
}

function formatShare(value: number, base: number | null): string | null {
  if (base === null || !hasNonZero(base)) return null
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value / base * 100)}%`
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value)
}

function detectSalesSchemeByMethod(rawSalesMethod: string): FulfillmentScheme | null {
  const method = normalizeLower(rawSalesMethod)
  if (!method) return null
  if (method.includes('fbs')) return 'fbs'
  if (method.includes('fbw') || method.includes('fbo')) return 'fbm'
  return null
}

function buildSalesSchemeLookups(rows: WbAccrualRow[]): {
  schemeBySrid: Map<string, FulfillmentScheme>
  schemeByBasketId: Map<string, FulfillmentScheme>
} {
  const schemeBySrid = new Map<string, FulfillmentScheme>()
  const schemeByBasketId = new Map<string, FulfillmentScheme>()

  for (const row of rows) {
    const detectedScheme = detectSalesSchemeByMethod(row.salesMethod)
    if (!detectedScheme) continue
    if (row.srid) schemeBySrid.set(row.srid, detectedScheme)
    if (row.basketId) schemeByBasketId.set(row.basketId, detectedScheme)
  }

  return { schemeBySrid, schemeByBasketId }
}

function resolveSalesScheme(
  row: WbAccrualRow,
  schemeBySrid: Map<string, FulfillmentScheme>,
  schemeByBasketId: Map<string, FulfillmentScheme>,
): FulfillmentScheme {
  const directScheme = detectSalesSchemeByMethod(row.salesMethod)
  if (directScheme) return directScheme

  if (row.srid && schemeBySrid.has(row.srid)) {
    return schemeBySrid.get(row.srid)!
  }
  if (row.basketId && schemeByBasketId.has(row.basketId)) {
    return schemeByBasketId.get(row.basketId)!
  }

  const method = normalizeLower(row.salesMethod)
  if (method.includes('маркетплейс') || method.includes('wildberries') || method.includes('вб')) return 'fbm'

  const warehouse = normalizeLower(row.warehouse)
  if (warehouse.includes('склад поставщика')) return 'fbs'
  if (warehouse.includes('склад вб') || warehouse.includes('склад wb') || warehouse.includes('wildberries')) return 'fbm'

  return 'unknown'
}

function createZeroAtoms(): WbMetricAtoms {
  return {
    salesQuantity: 0,
    returnsAndCancellationsQuantity: 0,
    returnsQuantity: 0,
    salesRevenueByRetailPrice: 0,
    salesRevenueBeforeSpp: 0,
    returnsRevenueBeforeSpp: 0,
    revenueWithoutSpp: 0,
    salesPayout: 0,
    wbCommissionCalculated: 0,
    returnsNetEffect: 0,
    logisticsAmount: 0,
    paymentServicesAmount: 0,
    storageAmount: 0,
    withholdingsAmount: 0,
    acceptanceOperationsAmount: 0,
    finesAmount: 0,
    vvCorrectionAmount: 0,
    pvzCompensationAmount: 0,
    transportReimbursementAmount: 0,
    voluntaryCompensation: 0,
    discountCompensation: 0,
    salesLogisticsAmount: 0,
    salesStorageAmount: 0,
    salesWithholdingsAmount: 0,
    salesAcceptanceOperationsAmount: 0,
    salesFinesAmount: 0,
    cogsFromFile: 0,
    cogsMatchedRows: 0,
  }
}

export function combineAtoms(atomsList: WbMetricAtoms[]): WbMetricAtoms {
  const combined = createZeroAtoms()
  for (const atoms of atomsList) {
    for (const key of Object.keys(combined) as Array<keyof WbMetricAtoms>) {
      combined[key] += atoms[key]
    }
  }
  return combined
}

function buildCells(atoms: WbMetricAtoms, params: WbMetricParams): WbMetricCells {
  const revenueBeforeSpp = atoms.salesRevenueBeforeSpp - atoms.returnsRevenueBeforeSpp
  const sppAndPromotions = atoms.salesRevenueBeforeSpp - atoms.revenueWithoutSpp
  const wbCommissionAmount = atoms.wbCommissionCalculated
  const marketplaceExpenses = wbCommissionAmount
    + atoms.logisticsAmount
    + atoms.paymentServicesAmount
    + atoms.storageAmount
    + atoms.withholdingsAmount
    + atoms.acceptanceOperationsAmount
    + atoms.finesAmount
  const transferToBank = atoms.salesPayout
    - atoms.logisticsAmount
    - atoms.storageAmount
    - atoms.acceptanceOperationsAmount
    - atoms.finesAmount
    - atoms.withholdingsAmount
    + atoms.vvCorrectionAmount
  const cogs = atoms.cogsMatchedRows > 0 ? atoms.cogsFromFile : null
  const salesBaseCandidate = transferToBank + marketplaceExpenses
  const salesBase = salesBaseCandidate > 0 ? salesBaseCandidate : null
  const taxAmount = revenueBeforeSpp === 0 ? 0 : revenueBeforeSpp * ((params.vatRatePercent + params.taxRatePercent) / 100)
  const netProfit = transferToBank - taxAmount - (cogs ?? 0)
  const marginRate = !hasNonZero(revenueBeforeSpp) ? null : netProfit / revenueBeforeSpp * 100

  return {
    salesQuantity: atoms.salesQuantity,
    cancellationsAndNonPickupsQuantity: atoms.returnsAndCancellationsQuantity,
    returnsQuantity: atoms.returnsQuantity,
    revenueBeforeSpp,
    revenueWithoutSpp: atoms.revenueWithoutSpp,
    sppAndPromotions,
    wbCommissionAmount,
    marketplaceExpenses,
    transferToBank,
    cogs,
    taxAmount,
    marginRate,
    netProfit,
    salesBase,
  }
}

function buildMolecules(atoms: WbMetricAtoms): Record<string, number | null> {
  return {
    revenueBeforeSpp: atoms.salesRevenueBeforeSpp - atoms.returnsRevenueBeforeSpp,
    sppAndPromotions: atoms.salesRevenueBeforeSpp - atoms.revenueWithoutSpp,
    wbCommissionAmount: atoms.wbCommissionCalculated,
    marketplaceExpenses: atoms.wbCommissionCalculated + atoms.logisticsAmount + atoms.paymentServicesAmount + atoms.storageAmount + atoms.withholdingsAmount + atoms.acceptanceOperationsAmount + atoms.finesAmount,
    cogs: atoms.cogsMatchedRows > 0 ? atoms.cogsFromFile : null,
  }
}

export function calculateWbMetrics(input: {
  rows: WbAccrualRow[]
  filters: WbMetricFilters
  params: WbMetricParams
  costByKey: Map<string, number>
}): WbMetricsResult {
  const filteredRows = input.rows.filter((row) => {
    if (!matchesPattern(row.article, input.filters.articlePattern, input.filters.excludeArticlePattern)) return false
    if (input.filters.priceMin !== null && row.retailPriceWithDiscount < input.filters.priceMin) return false
    if (input.filters.priceMax !== null && row.retailPriceWithDiscount > input.filters.priceMax) return false
    return true
  })

  const resolveCogs = (row: WbAccrualRow): number | null => {
    const key = resolveCogsLookupKey(row.article, input.params.cogsMatchingMode)
    return input.costByKey.get(key) ?? null
  }

  const salesPayout = sum(filteredRows, (row) => row.payout, isSale)
  const returnsPayout = sum(filteredRows, (row) => row.payout, isReturn)
  const otherPositivePayout = sum(filteredRows, (row) => row.payout, (row) => !isSale(row) && !isReturn(row) && row.payout > 0)
  const atoms: WbMetricAtoms = {
    salesQuantity: sum(filteredRows, (row) => row.quantity, isSale),
    returnsAndCancellationsQuantity: sum(filteredRows, (row) => row.returnCount, (row) => !isReturn(row)),
    returnsQuantity: filteredRows.filter(isReturn).length,
    salesRevenueByRetailPrice: sum(filteredRows, (row) => row.retailPrice, isSale),
    salesRevenueBeforeSpp: sum(filteredRows, (row) => row.retailPriceWithDiscount, isSale),
    returnsRevenueBeforeSpp: sum(filteredRows, (row) => row.retailPriceWithDiscount, isReturn),
    revenueWithoutSpp: sum(filteredRows, (row) => row.retailAmount, isSale),
    salesPayout: salesPayout - returnsPayout + otherPositivePayout,
    wbCommissionCalculated: sum(filteredRows, (row) => row.retailPriceWithDiscount * row.wbCommissionRate / 100, isSale) - sum(filteredRows, (row) => row.retailPriceWithDiscount * row.wbCommissionRate / 100, isReturn),
    returnsNetEffect: sum(filteredRows, calculateRowNetEffect, isReturn),
    logisticsAmount: abs(sum(filteredRows, (row) => row.logisticsCost)),
    paymentServicesAmount: abs(sum(filteredRows, (row) => row.paymentServicesCommission, isSale)) - abs(sum(filteredRows, (row) => row.paymentServicesCommission, isReturn)),
    storageAmount: abs(sum(filteredRows, (row) => row.storageCost)),
    withholdingsAmount: abs(sum(filteredRows, (row) => row.withholdings)),
    acceptanceOperationsAmount: abs(sum(filteredRows, (row) => row.acceptanceOperations)),
    finesAmount: abs(sum(filteredRows, (row) => row.fines)),
    vvCorrectionAmount: -sum(filteredRows, (row) => row.vvCorrection),
    pvzCompensationAmount: abs(sum(filteredRows, (row) => row.pvzCompensation)),
    transportReimbursementAmount: abs(sum(filteredRows, (row) => row.transportReimbursement)),
    voluntaryCompensation: sum(filteredRows, (row) => row.payout, (row) => {
      const reason = normalizeLower(row.reason)
      return reason.includes('добровольн') && reason.includes('компенсац')
    }),
    discountCompensation: abs(sum(filteredRows, (row) => row.loyaltyCompensation)),
    salesLogisticsAmount: abs(sum(filteredRows, (row) => row.logisticsCost, isSale)),
    salesStorageAmount: abs(sum(filteredRows, (row) => row.storageCost, isSale)),
    salesWithholdingsAmount: abs(sum(filteredRows, (row) => row.withholdings, isSale)),
    salesAcceptanceOperationsAmount: abs(sum(filteredRows, (row) => row.acceptanceOperations, isSale)),
    salesFinesAmount: abs(sum(filteredRows, (row) => row.fines, isSale)),
    cogsFromFile: sum(filteredRows, (row) => row.quantity * (resolveCogs(row) ?? 0), (row) => isSale(row) && resolveCogs(row) !== null)
      - sum(filteredRows, (row) => row.quantity * (resolveCogs(row) ?? 0), (row) => isReturn(row) && resolveCogs(row) !== null),
    cogsMatchedRows: filteredRows.filter((row) => isSale(row) && resolveCogs(row) !== null).length,
  }

  const cells = buildCells(atoms, input.params)
  const molecules = buildMolecules(atoms)
  const breakdowns = buildBreakdowns(filteredRows, atoms, cells)
  const missingCogsArticles = buildMissingCogsArticles(filteredRows, input.costByKey, input.params.cogsMatchingMode)

  return {
    rowCount: filteredRows.length,
    atoms,
    molecules,
    cells,
    breakdowns,
    dataQuality: {
      cogsMatchedRows: atoms.cogsMatchedRows,
      missingCogsArticles,
      warnings: input.costByKey.size === 0 ? ['Файл себестоимости не загружен.'] : [],
    },
    reportGroups: buildReportGroups(filteredRows.length, atoms, cells, breakdowns),
  }
}

function buildMissingCogsArticles(rows: WbAccrualRow[], costByKey: Map<string, number>, mode: 'full' | 'digits'): string[] {
  if (costByKey.size === 0) return []
  const missingByKey = new Map<string, string>()
  for (const row of rows) {
    if (!row.article) continue
    const key = resolveCogsLookupKey(row.article, mode)
    if (!costByKey.has(key) && !missingByKey.has(key)) {
      missingByKey.set(key, row.article)
    }
  }
  return Array.from(missingByKey.values()).sort((a, b) => a.localeCompare(b, 'ru'))
}

function buildBreakdowns(rows: WbAccrualRow[], atoms: WbMetricAtoms, cells: WbMetricCells): WbMetricBreakdowns {
  const expenses = [
    ['Комиссия ВБ', -cells.wbCommissionAmount],
    ['Логистика', -atoms.logisticsAmount],
    ['Продвижение', -atoms.withholdingsAmount],
    ['Эквайринг', -atoms.paymentServicesAmount],
    ['Хранение ФБО', -atoms.storageAmount],
    ['Штрафы', -atoms.finesAmount],
    ['Операции на приемке', -atoms.acceptanceOperationsAmount],
  ] as const

  const schemeMap = new Map<FulfillmentScheme, number>(FULFILLMENT_SCHEME_ORDER.map((scheme) => [scheme, 0]))
  const { schemeBySrid, schemeByBasketId } = buildSalesSchemeLookups(rows)
  const dailyMap = new Map<string, number>()
  const dailyReasonMap = new Map<string, Map<string, number>>()
  const reasonTypeMap = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const amount = calculateRowNetEffect(row)
    const date = row.salesDate || 'Без даты'
    const reason = row.reason || 'Без обоснования'
    const type = row.logisticsKind || row.documentType || 'Без подтипа'
    addToMap(dailyMap, date, amount)
    if (!dailyReasonMap.has(date)) dailyReasonMap.set(date, new Map())
    addToMap(dailyReasonMap.get(date)!, reason, amount)
    if (!reasonTypeMap.has(reason)) reasonTypeMap.set(reason, new Map())
    addToMap(reasonTypeMap.get(reason)!, type, amount)
    if (isSale(row)) addToMap(schemeMap, resolveSalesScheme(row, schemeBySrid, schemeByBasketId), row.retailPrice)
  }

  return {
    expenses: expenses
      .filter(([, value]) => hasNonZero(value))
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([label, value]) => ({ label, value, shareText: formatShare(value, cells.salesBase) })),
    salesScheme: Array.from(schemeMap.entries())
      .filter(([scheme, value]) => !(scheme === 'unknown' && value === 0))
      .map(([scheme, value]) => ({
        label: WB_FULFILLMENT_SCHEME_LABELS[scheme],
        value,
      })),
    dailyDynamics: Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'ru'))
      .map(([label, value]) => {
        const topNegative = Array.from(dailyReasonMap.get(label)?.entries() ?? [])
          .filter(([, reasonValue]) => reasonValue < 0)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
        return {
          label,
          value,
          shareText: value < 0 && topNegative ? topNegative[0] : value > 0 ? 'Выручка' : 'Нейтрально',
        }
      }),
    reasonStructure: Array.from(reasonTypeMap.entries())
      .map(([reason, typeMap]) => ({
        title: `Структура: ${reason}`,
        total: Array.from(typeMap.values()).reduce((acc, value) => acc + value, 0),
        metrics: Array.from(typeMap.entries())
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 3)
          .map(([label, value]) => ({ label, value })),
      }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .map(({ title, metrics }) => ({ title, metrics })),
  }
}

function buildPeriodLabel(rows: WbAccrualRow[]): string | undefined {
  const dates = rows.map((row) => row.salesDate).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'))
  if (dates.length === 0) return undefined
  return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} - ${dates[dates.length - 1]}`
}

function buildReportGroups(rowCount: number, atoms: WbMetricAtoms, cells: WbMetricCells, breakdowns: WbMetricBreakdowns): WbMetricsResult['reportGroups'] {
  return [
    {
      title: 'Итоги периода',
      rowCount,
      metrics: [
        { label: 'Количество продаж', value: cells.salesQuantity, type: 'number' },
        { label: 'Отмены и не выкупы', value: cells.cancellationsAndNonPickupsQuantity, type: 'number' },
        { label: 'Возвраты', value: cells.returnsQuantity, type: 'count' },
        { label: 'Выручка с учетом СПП', value: cells.revenueBeforeSpp, type: 'currency' },
        { label: 'Выручка без СПП', value: cells.revenueWithoutSpp, type: 'currency' },
        { label: 'СПП и акции', value: cells.sppAndPromotions, type: 'currency', shareText: formatShare(cells.sppAndPromotions, cells.revenueBeforeSpp) },
        { label: 'Общие затраты по Маркетплейсу', value: cells.marketplaceExpenses, type: 'currency', shareText: formatShare(cells.marketplaceExpenses, cells.salesBase) },
        { label: 'Перевод в банк', value: cells.transferToBank, type: 'currency' },
        { label: 'Себестоимость', value: cells.cogs, type: 'currency', shareText: cells.cogs !== null ? formatShare(cells.cogs, cells.salesBase) : null },
        { label: 'Налог', value: cells.taxAmount, type: 'currency' },
        { label: 'Маржинальность', value: cells.marginRate, type: 'percent' },
        { label: 'Чистая прибыль', value: cells.netProfit, type: 'currency' },
      ],
    },
    {
      title: 'Общие затраты по Маркетплейсу',
      metrics: [
        ...breakdowns.expenses.map((item) => ({ label: item.label, value: item.value, type: 'currency' as const, shareText: item.shareText })),
        { label: 'Итого расходов', value: -Math.abs(cells.marketplaceExpenses), type: 'currency' as const, shareText: formatShare(cells.marketplaceExpenses, cells.salesBase) },
        { label: 'Итого компенсаций', value: atoms.voluntaryCompensation + atoms.discountCompensation, type: 'currency' as const },
      ],
    },
    {
      title: 'Схема работы',
      metrics: breakdowns.salesScheme.map((item) => ({ label: item.label, value: item.value, type: 'currency' as const })),
    },
    {
      title: 'Динамика по датам начисления',
      metrics: breakdowns.dailyDynamics.map((item) => ({ label: item.label, value: item.value, type: 'currency' as const, shareText: item.shareText })),
    },
    ...breakdowns.reasonStructure.map((group) => ({
      title: group.title,
      metrics: group.metrics.map((item) => ({ label: item.label, value: item.value, type: 'currency' as const })),
    })),
  ]
}

export function buildWbReportGroupsFromCombined(input: {
  rowCount: number
  atoms: WbMetricAtoms
  params: WbMetricParams
  breakdowns: WbMetricBreakdowns
}): Pick<WbMetricsResult, 'molecules' | 'cells' | 'reportGroups'> {
  const cells = buildCells(input.atoms, input.params)
  return {
    molecules: buildMolecules(input.atoms),
    cells,
    reportGroups: buildReportGroups(input.rowCount, input.atoms, cells, input.breakdowns),
  }
}

export function createRequestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

export function getWbMetricFields(): string[] {
  return [
    'vendorCode',
    'docTypeName',
    'sellerOperName',
    'saleDt',
    'deliveryMethod',
    'officeName',
    'orderUid',
    'srid',
    'bonusTypeName',
    'quantity',
    'returnAmount',
    'deliveryAmount',
    'retailPrice',
    'retailPriceWithDisc',
    'retailAmount',
    'forPay',
    'deliveryService',
    'commissionPercent',
    'vw',
    'acquiringFee',
    'ppvzReward',
    'rebillLogisticCost',
    'paidStorage',
    'deduction',
    'paidAcceptance',
    'penalty',
    'additionalPayment',
    'cashbackDiscount',
    'cashbackCommissionChange',
    'cashbackAmount',
  ]
}
