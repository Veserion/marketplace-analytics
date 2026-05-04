import {
  WB_BASE_COLUMNS,
  WB_COGS_COLUMNS,
  WB_EXPENSE_COLUMNS,
  WB_LOYALTY_COLUMNS,
  WB_QUANTITY_COLUMNS,
  WB_REVENUE_COLUMNS
} from '@/entities/wildberries-report/model/columns'
import {normalizeLower} from '@/shared/lib/reporting'
import type {WildberriesAccrualRow} from '@/entities/wildberries-report/model/metrics/types'

const SALE_REASON = 'продажа'
const RETURN_REASON = 'возврат'
const WILDBERRIES_ROW_NET_EFFECT_FORMULA = [
  'CASE',
  `WHEN "${WB_BASE_COLUMNS.reason}" IN ("Продажа", "Возврат") THEN "${WB_REVENUE_COLUMNS.payout}"`,
  `WHEN "${WB_BASE_COLUMNS.reason}" = "Компенсация скидки по программе лояльности" THEN COALESCE_NON_ZERO(ABS("${WB_LOYALTY_COLUMNS.loyaltyCompensation}") - ABS("${WB_LOYALTY_COLUMNS.loyaltyProgramCost}") - ABS("${WB_LOYALTY_COLUMNS.loyaltyPointsWithheld}"), "${WB_REVENUE_COLUMNS.payout}")`,
  `WHEN "${WB_BASE_COLUMNS.reason}" содержит "логистика" или "коррекция логистики" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -ABS("${WB_EXPENSE_COLUMNS.logisticsToBuyer}"))`,
  `WHEN "${WB_BASE_COLUMNS.reason}" = "Возмещение за выдачу и возврат товаров на ПВЗ" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -ABS("${WB_EXPENSE_COLUMNS.pvzCompensation}"))`,
  `WHEN "${WB_BASE_COLUMNS.reason}" = "Возмещение издержек по перевозке/по складским операциям с товаром" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -ABS("${WB_EXPENSE_COLUMNS.transportReimbursement}"))`,
  `WHEN "${WB_BASE_COLUMNS.reason}" = "Хранение" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -ABS("${WB_EXPENSE_COLUMNS.storage}"))`,
  `WHEN "${WB_BASE_COLUMNS.reason}" = "Обработка товара" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -(ABS("${WB_EXPENSE_COLUMNS.withholdings}") + ABS("${WB_EXPENSE_COLUMNS.acceptanceOperations}")))`,
  `WHEN "${WB_BASE_COLUMNS.reason}" содержит "удержан" / "услуга платной доставки" / "бронирование товара через самовывоз" / "разовое изменение срока перечисления" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -ABS("${WB_EXPENSE_COLUMNS.withholdings}"))`,
  `WHEN "${WB_BASE_COLUMNS.reason}" = "Штраф" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -ABS("${WB_EXPENSE_COLUMNS.fines}"))`,
  `WHEN "${WB_BASE_COLUMNS.reason}" содержит "компенсация ущерба" или "добровольная компенсация при возврате" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", 0)`,
  `WHEN "${WB_BASE_COLUMNS.reason}" содержит "коррекция продаж" или "коррекция эквайринга" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", "${WB_EXPENSE_COLUMNS.vvCorrection}")`,
  `WHEN "${WB_BASE_COLUMNS.reason}" = "Стоимость участия в программе лояльности" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -ABS("${WB_LOYALTY_COLUMNS.loyaltyProgramCost}"))`,
  `WHEN "${WB_BASE_COLUMNS.reason}" = "Сумма удержанная за начисленные баллы программы лояльности" THEN COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", -ABS("${WB_LOYALTY_COLUMNS.loyaltyPointsWithheld}"))`,
  `ELSE COALESCE_NON_ZERO("${WB_REVENUE_COLUMNS.payout}", "${WB_EXPENSE_COLUMNS.vvCorrection}" + ABS("${WB_LOYALTY_COLUMNS.loyaltyCompensation}") - ABS("${WB_LOYALTY_COLUMNS.loyaltyProgramCost}") - ABS("${WB_LOYALTY_COLUMNS.loyaltyPointsWithheld}") - ABS("${WB_EXPENSE_COLUMNS.logisticsToBuyer}") - ABS("${WB_EXPENSE_COLUMNS.paymentServices}") - ABS("${WB_EXPENSE_COLUMNS.pvzCompensation}") - ABS("${WB_EXPENSE_COLUMNS.transportReimbursement}") - ABS("${WB_EXPENSE_COLUMNS.storage}") - ABS("${WB_EXPENSE_COLUMNS.withholdings}") - ABS("${WB_EXPENSE_COLUMNS.acceptanceOperations}") - ABS("${WB_EXPENSE_COLUMNS.fines}"))`,
  'END',
].join(' ')

export function buildWildberriesNetEffectSumFormula(filters: string[] = []): string {
  const filterText = filters.length > 0 ? `, фильтр: ${filters.join(' и ')}` : ''
  return `SUM(${WILDBERRIES_ROW_NET_EFFECT_FORMULA})${filterText}`
}

export const WILDBERRIES_ACCRUAL_ATOM_FORMULAS = {
  salesQuantity: `SUM("${WB_QUANTITY_COLUMNS.qty}"), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  returnsAndCancellationsQuantity: `SUM("${WB_QUANTITY_COLUMNS.returnQty}"), фильтр: "${WB_BASE_COLUMNS.reason}" ≠ "Возврат"`,
  returnsQuantity: `COUNT(строк), фильтр: "${WB_BASE_COLUMNS.reason}" = "Возврат"`,
  salesRevenueByRetailPrice: `SUM("${WB_REVENUE_COLUMNS.retailPrice}"), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  salesRevenueBeforeSpp: `SUM("${WB_REVENUE_COLUMNS.retailPriceWithDiscount}"), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  returnsRevenueBeforeSpp: `SUM("${WB_REVENUE_COLUMNS.retailPriceWithDiscount}"), фильтр: "${WB_BASE_COLUMNS.reason}" = "Возврат"`,
  revenueWithoutSpp: `SUM("${WB_REVENUE_COLUMNS.retailAmount}"), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  salesPayout: `SUM("${WB_REVENUE_COLUMNS.payout}", фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа") - SUM("${WB_REVENUE_COLUMNS.payout}", фильтр: "${WB_BASE_COLUMNS.reason}" = "Возврат") + SUM("${WB_REVENUE_COLUMNS.payout}", фильтр: "${WB_BASE_COLUMNS.reason}" ≠ "Продажа" и "${WB_BASE_COLUMNS.reason}" ≠ "Возврат" и значение > 0)`,
  wbCommissionCalculated: `SUM("${WB_REVENUE_COLUMNS.retailPriceWithDiscount}" * "${WB_EXPENSE_COLUMNS.wbCommissionRate}" / 100, фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа") - SUM("${WB_REVENUE_COLUMNS.retailPriceWithDiscount}" * "${WB_EXPENSE_COLUMNS.wbCommissionRate}" / 100, фильтр: "${WB_BASE_COLUMNS.reason}" = "Возврат")`,
  returnsNetEffect: buildWildberriesNetEffectSumFormula([`"${WB_BASE_COLUMNS.reason}" = "Возврат"`]),
  logisticsAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.logisticsToBuyer}"))`,
  paymentServicesAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.paymentServices}", фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа")) - ABS(SUM("${WB_EXPENSE_COLUMNS.paymentServices}", фильтр: "${WB_BASE_COLUMNS.reason}" = "Возврат"))`,
  storageAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.storage}"))`,
  withholdingsAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.withholdings}"))`,
  acceptanceOperationsAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.acceptanceOperations}"))`,
  finesAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.fines}"))`,
  vvCorrectionAmount: `-SUM("${WB_EXPENSE_COLUMNS.vvCorrection}")`,
  pvzCompensationAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.pvzCompensation}"))`,
  transportReimbursementAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.transportReimbursement}"))`,
  voluntaryCompensation: `SUM("${WB_REVENUE_COLUMNS.payout}", фильтр: "${WB_BASE_COLUMNS.reason}" содержит "добровольная компенсация")`,
  discountCompensation: `SUM("${WB_LOYALTY_COLUMNS.loyaltyCompensation}")`,
  salesLogisticsAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.logisticsToBuyer}")), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  salesStorageAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.storage}")), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  salesWithholdingsAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.withholdings}")), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  salesAcceptanceOperationsAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.acceptanceOperations}")), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  salesFinesAmount: `ABS(SUM("${WB_EXPENSE_COLUMNS.fines}")), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа"`,
  cogsFromFile: `SUM("${WB_QUANTITY_COLUMNS.qty}" * "${WB_COGS_COLUMNS.cogs}"), фильтр: "${WB_BASE_COLUMNS.reason}" = "Продажа" и артикул найден в CSV себестоимости`,
  cogsMatchedRows: `COUNT(строк продаж с найденной "${WB_COGS_COLUMNS.cogs}")`,
} as const

type UnitCogsResolver = (row: WildberriesAccrualRow) => number | null

/**
 * Суммирует выбранную числовую колонку по строкам, опционально с фильтром.
 * Используется атомами как общий чистый примитив `SUM(...)`.
 */
function sumRows(
  rows: WildberriesAccrualRow[],
  getValue: (row: WildberriesAccrualRow) => number,
  predicate: (row: WildberriesAccrualRow) => boolean = () => true,
): number {
  return rows.reduce((sum, row) => (predicate(row) ? sum + getValue(row) : sum), 0)
}

/**
 * Приводит сумму расходной колонки к модулю.
 * Используется атомами вида `ABS(SUM(...))`.
 */
function absValue(value: number): number {
  return Math.abs(value)
}

/**
 * Проверяет, есть ли значимое числовое значение.
 * Используется fallback-правилами `net effect`.
 */
function hasNonZero(value: number): boolean {
  return Math.abs(value) > 0
}

/**
 * Проверяет, содержит ли нормализованное основание оплаты любой из маркеров.
 * Используется группами правил `net effect`.
 */
function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}

/**
 * Возвращает выплату WB, а при ее отсутствии fallback с ожидаемым знаком.
 * Используется в строковой формуле `net effect`.
 */
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

/**
 * Проверяет строку продажи по `Обоснование для оплаты`.
 * Используется атомами продаж и builder-ом для схемы работы/COGS.
 */
export function isWildberriesSaleRow(row: WildberriesAccrualRow): boolean {
  return normalizeLower(row.reason) === SALE_REASON
}

/**
 * Проверяет строку возврата по `Обоснование для оплаты`.
 * Используется атомами возвратов.
 */
export function isWildberriesReturnRow(row: WildberriesAccrualRow): boolean {
  return normalizeLower(row.reason) === RETURN_REASON
}

/**
 * Чистая формула `net effect` одной строки WB.
 * Используется атомом `returnsNetEffect` и builder-группировками по причинам/датам.
 */
export function calculateWildberriesRowNetEffect(row: WildberriesAccrualRow): number {
  const reason = normalizeLower(row.reason)
  const payout = row.payout

  if (reason === SALE_REASON || reason === RETURN_REASON) {
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

  return fallbackKnownAmount !== 0 ? fallbackKnownAmount : 0
}

/**
 * Атом `Количество продаж`: сумма `Кол-во` только по строкам `Продажа`.
 * Используется cell `Количество продаж`.
 */
export function calculateWildberriesSalesQuantity(rows: WildberriesAccrualRow[]): number {
  return sumRows(rows, (row) => row.quantity, isWildberriesSaleRow)
}

/**
 * Атом `Отмены и не выкупы`: сумма `Количество возврата` по строкам, где `Обоснование для оплаты` ≠ "Возврат".
 * Используется cell `Отмены и не выкупы`.
 */
export function calculateWildberriesReturnsAndCancellationsQuantity(rows: WildberriesAccrualRow[]): number {
  return sumRows(rows, (row) => row.returnCount, (row) => !isWildberriesReturnRow(row))
}

/**
 * Атом `Возвраты`: количество строк, где `Обоснование для оплаты` = "Возврат".
 * Используется cell `Возвраты` (кол-во).
 */
export function calculateWildberriesReturnsQuantity(rows: WildberriesAccrualRow[]): number {
  return rows.filter(isWildberriesReturnRow).length
}

/**
 * Атом продажной розничной выручки: сумма `Цена розничная` по строкам `Продажа`.
 * Используется группой `Схема работы`.
 */
export function calculateWildberriesSalesRevenueByRetailPrice(rows: WildberriesAccrualRow[]): number {
  return sumRows(rows, (row) => row.retailPrice, isWildberriesSaleRow)
}

/**
 * Атом продажной выручки с СПП: сумма `Цена розничная с учетом согласованной скидки` по строкам `Продажа`.
 * Используется молекулой `Выручка с учетом СПП`.
 */
export function calculateWildberriesSalesRevenueBeforeSpp(rows: WildberriesAccrualRow[]): number {
  return sumRows(rows, (row) => row.retailPriceWithDiscount, isWildberriesSaleRow)
}

/**
 * Атом возвратной выручки с СПП: сумма той же колонки по строкам `Возврат`.
 * Используется молекулой `Выручка с учетом СПП`.
 */
export function calculateWildberriesReturnsRevenueBeforeSpp(rows: WildberriesAccrualRow[]): number {
  return sumRows(rows, (row) => row.retailPriceWithDiscount, isWildberriesReturnRow)
}

/**
 * Атом `Выручка без СПП`: сумма `Вайлдберриз реализовал Товар (Пр)` только по строкам `Продажа`.
 * Возвраты здесь не вычитаются; если понадобится net-метрика, она должна быть отдельной молекулой.
 */
export function calculateWildberriesRevenueWithoutSpp(rows: WildberriesAccrualRow[]): number {
  return sumRows(rows, (row) => row.retailAmount, isWildberriesSaleRow)
}

/**
 * Атом выплаты: сумма `К перечислению Продавцу за реализованный Товар` по продажам
 * минус сумма по возвратам плюс прочие положительные начисления в этом же столбце.
 * Используется молекулами `Комиссия ВБ` и `Перевод в банк`.
 */
export function calculateWildberriesSalesPayout(rows: WildberriesAccrualRow[]): number {
  const salesPayout = sumRows(rows, (row) => row.payout, isWildberriesSaleRow)
  const returnsPayout = sumRows(rows, (row) => row.payout, isWildberriesReturnRow)
  const otherPositivePayout = sumRows(
    rows,
    (row) => row.payout,
    (row) => !isWildberriesSaleRow(row) && !isWildberriesReturnRow(row) && row.payout > 0,
  )
  return salesPayout - returnsPayout + otherPositivePayout
}

/**
 * Атом расчётной комиссии ВБ: комиссия по продажам минус комиссия по возвратам.
 * Формула: `Цена розничная с учетом согласованной скидки * Размер кВВ, % / 100`.
 * Используется молекулой `Комиссия ВБ`.
 */
export function calculateWildberriesWbCommissionCalculated(rows: WildberriesAccrualRow[]): number {
  const salesCommission = sumRows(rows, (row) => row.retailPriceWithDiscount * row.wbCommissionRate / 100, isWildberriesSaleRow)
  const returnsCommission = sumRows(rows, (row) => row.retailPriceWithDiscount * row.wbCommissionRate / 100, isWildberriesReturnRow)
  return salesCommission - returnsCommission
}

/**
 * Атом эффекта возвратов: сумма `net effect` по строкам `Возврат`.
 * Используется молекулой `Возвраты`.
 */
export function calculateWildberriesReturnsNetEffect(rows: WildberriesAccrualRow[]): number {
  return sumRows(rows, calculateWildberriesRowNetEffect, isWildberriesReturnRow)
}

/**
 * Атом логистики: модуль суммы `Услуги по доставке товара покупателю`.
 * Логистика начисляется на отдельных строках с reason "Логистика" / "Коррекция логистики",
 * а не на строках продаж/возвратов.
 * Используется молекулами `Общие затраты по Маркетплейсу` и `Перевод в банк`.
 */
export function calculateWildberriesLogisticsAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.logisticsCost))
}

/**
 * Атом эквайринга: эквайринг по продажам минус эквайринг по возвратам.
 * Используется молекулами `Общие затраты по Маркетплейсу` и `Перевод в банк`.
 */
export function calculateWildberriesPaymentServicesAmount(rows: WildberriesAccrualRow[]): number {
  const salesPaymentServices = absValue(sumRows(rows, (row) => row.paymentServicesCommission, isWildberriesSaleRow))
  const returnsPaymentServices = absValue(sumRows(rows, (row) => row.paymentServicesCommission, isWildberriesReturnRow))
  return salesPaymentServices - returnsPaymentServices
}

/**
 * Атом хранения: модуль суммы `Хранение`.
 * Используется молекулой `Общие затраты по Маркетплейсу`.
 */
export function calculateWildberriesStorageAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.storageCost))
}

/**
 * Атом удержаний: модуль суммы `Удержания`.
 * Используется молекулой `Общие затраты по Маркетплейсу`.
 */
export function calculateWildberriesWithholdingsAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.withholdings))
}

/**
 * Атом операций приемки: модуль суммы `Операции на приемке`.
 * Используется молекулами `Общие затраты по Маркетплейсу` и `Перевод в банк`.
 */
export function calculateWildberriesAcceptanceOperationsAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.acceptanceOperations))
}

/**
 * Атом штрафов: модуль суммы `Общая сумма штрафов`.
 * Используется молекулами `Общие затраты по Маркетплейсу` и `Перевод в банк`.
 */
export function calculateWildberriesFinesAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.fines))
}

/**
 * Атом корректировки ВВ: отрицательная сумма `Корректировка Вознаграждения Вайлдберриз (ВВ)`.
 * Используется молекулой `Общие затраты по Маркетплейсу`.
 */
export function calculateWildberriesVvCorrectionAmount(rows: WildberriesAccrualRow[]): number {
  return -sumRows(rows, (row) => row.vvCorrection)
}

/**
 * Атом возмещения ПВЗ: модуль суммы `Возмещение за выдачу и возврат товаров на ПВЗ`.
 * Используется молекулой `Общие затраты по Маркетплейсу`.
 */
export function calculateWildberriesPvzCompensationAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.pvzCompensation))
}

/**
 * Атом возмещения перевозки/складских операций: модуль суммы соответствующей WB-колонки.
 * Используется молекулой `Общие затраты по Маркетплейсу`.
 */
export function calculateWildberriesTransportReimbursementAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.transportReimbursement))
}

/**
 * Атом добровольной компенсации: сумма выплат по строкам с reason "добровольная компенсация при возврате".
 * Используется детальным блоком "Общие затраты по Маркетплейсу" и расшифровкой "Продажи и возвраты".
 */
export function calculateWildberriesVoluntaryCompensation(rows: WildberriesAccrualRow[]): number {
  return sumRows(
    rows,
    (row) => row.payout,
    (row) => normalizeLower(row.reason).includes('добровольн') && normalizeLower(row.reason).includes('компенсац'),
  )
}

/**
 * Атом компенсации скидки: модуль суммы `Компенсация скидки по программе лояльности`.
 * Используется детальным блоком "Общие затраты по Маркетплейсу" и расшифровкой "Продажи и возвраты".
 */
export function calculateWildberriesDiscountCompensation(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.loyaltyCompensation))
}

/**
 * Атом логистики продаж: модуль суммы логистики только по строкам `Продажа`.
 * Используется молекулой `Перевод в банк`.
 */
export function calculateWildberriesSalesLogisticsAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.logisticsCost, isWildberriesSaleRow))
}

/**
 * Атом хранения продаж: модуль суммы хранения только по строкам `Продажа`.
 * Используется молекулой `Перевод в банк`.
 */
export function calculateWildberriesSalesStorageAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.storageCost, isWildberriesSaleRow))
}

/**
 * Атом удержаний продаж: модуль суммы удержаний только по строкам `Продажа`.
 * Используется молекулой `Перевод в банк`.
 */
export function calculateWildberriesSalesWithholdingsAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.withholdings, isWildberriesSaleRow))
}

/**
 * Атом операций приемки продаж: модуль суммы операций приемки только по строкам `Продажа`.
 * Используется молекулой `Перевод в банк`.
 */
export function calculateWildberriesSalesAcceptanceOperationsAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.acceptanceOperations, isWildberriesSaleRow))
}

/**
 * Атом штрафов продаж: модуль суммы штрафов только по строкам `Продажа`.
 * Используется молекулой `Перевод в банк`.
 */
export function calculateWildberriesSalesFinesAmount(rows: WildberriesAccrualRow[]): number {
  return absValue(sumRows(rows, (row) => row.fines, isWildberriesSaleRow))
}

/**
 * Атом себестоимости: сумма `Кол-во * Себестоимость` по строкам продаж с найденной себестоимостью.
 * Используется cell `Себестоимость` и cell `Чистая прибыль`.
 */
export function calculateWildberriesCogsFromFile(
  rows: WildberriesAccrualRow[],
  resolveUnitCogs: UnitCogsResolver,
): number {
  return sumRows(
    rows,
    (row) => row.quantity * (resolveUnitCogs(row) ?? 0),
    (row) => isWildberriesSaleRow(row) && resolveUnitCogs(row) !== null,
  ) - sumRows(
    rows,
    (row) => row.quantity * (resolveUnitCogs(row) ?? 0),
    (row) => isWildberriesReturnRow(row) && resolveUnitCogs(row) !== null,
  )
}

/**
 * Атом количества строк с найденной себестоимостью.
 * Используется для решения, показывать ли `Себестоимость` как число или как отсутствие данных.
 */
export function calculateWildberriesCogsMatchedRows(
  rows: WildberriesAccrualRow[],
  resolveUnitCogs: UnitCogsResolver,
): number {
  return rows.filter((row) => isWildberriesSaleRow(row) && resolveUnitCogs(row) !== null).length
}
