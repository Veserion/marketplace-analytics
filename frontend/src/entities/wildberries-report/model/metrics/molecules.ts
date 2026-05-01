import { WILDBERRIES_ACCRUAL_ATOM_FORMULAS } from '@/entities/wildberries-report/model/metrics/atoms'
import type { WildberriesAccrualMetricAtoms } from '@/entities/wildberries-report/model/metrics/types'

const revenueBeforeSppFormula = `(${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.salesRevenueBeforeSpp}) - (${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.returnsRevenueBeforeSpp})`
const sppAndPromotionsFormula = `(${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.salesRevenueBeforeSpp}) - (${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.revenueWithoutSpp})`
const wbCommissionAmountFormula = WILDBERRIES_ACCRUAL_ATOM_FORMULAS.wbCommissionCalculated
const marketplaceExpensesFormula = [
  `(${wbCommissionAmountFormula})`,
  WILDBERRIES_ACCRUAL_ATOM_FORMULAS.logisticsAmount,
  WILDBERRIES_ACCRUAL_ATOM_FORMULAS.paymentServicesAmount,
  WILDBERRIES_ACCRUAL_ATOM_FORMULAS.storageAmount,
  WILDBERRIES_ACCRUAL_ATOM_FORMULAS.withholdingsAmount,
  WILDBERRIES_ACCRUAL_ATOM_FORMULAS.acceptanceOperationsAmount,
  WILDBERRIES_ACCRUAL_ATOM_FORMULAS.finesAmount,
].join(' + ')
const transferToBankFormula = [
  WILDBERRIES_ACCRUAL_ATOM_FORMULAS.salesPayout,
  `- (${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.logisticsAmount})`,
  `- (${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.storageAmount})`,
  `- (${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.acceptanceOperationsAmount})`,
  `- (${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.finesAmount})`,
  `- (${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.withholdingsAmount})`,
  `+ (${WILDBERRIES_ACCRUAL_ATOM_FORMULAS.vvCorrectionAmount})`,
].join(' ')

export const WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS = {
  revenueBeforeSpp: revenueBeforeSppFormula,
  sppAndPromotions: sppAndPromotionsFormula,
  wbCommissionAmount: wbCommissionAmountFormula,
  marketplaceExpenses: marketplaceExpensesFormula,
  transferToBank: transferToBankFormula,
  cogs: WILDBERRIES_ACCRUAL_ATOM_FORMULAS.cogsFromFile,
} as const

/**
 * Молекула `Выручка с учетом СПП`: продажный атом минус возвратный атом по той же колонке.
 * Используется cell `Выручка с учетом СПП`, налогом, маржинальностью и расходными долями.
 */
export function calculateWildberriesRevenueBeforeSpp(atoms: WildberriesAccrualMetricAtoms): number {
  return atoms.salesRevenueBeforeSpp - atoms.returnsRevenueBeforeSpp
}

/**
 * Молекула `СПП и акции`: выручка с СПП (только продажи) минус атом `Выручка без СПП`.
 * Используется cell `СПП и акции`.
 */
export function calculateWildberriesSppAndPromotions(atoms: WildberriesAccrualMetricAtoms): number {
  return atoms.salesRevenueBeforeSpp - atoms.revenueWithoutSpp
}

/**
 * Молекула `Комиссия ВБ`: расчётная комиссия по формуле `Цена розничная с учетом согласованной скидки * Размер кВВ, % / 100`.
 * Используется в группе расходов и в `Общие затраты по Маркетплейсу`.
 */
export function calculateWildberriesWbCommissionAmount(atoms: WildberriesAccrualMetricAtoms): number {
  return atoms.wbCommissionCalculated
}

/**
 * Молекула `Общие затраты по Маркетплейсу`: комиссия WB плюс атомы расходов.
 * Используется cell `Общие затраты по Маркетплейсу` и итогом группы расходов.
 */
export function calculateWildberriesMarketplaceExpenses(atoms: WildberriesAccrualMetricAtoms): number {
  return calculateWildberriesWbCommissionAmount(atoms)
    + atoms.logisticsAmount
    + atoms.paymentServicesAmount
    + atoms.storageAmount
    + atoms.withholdingsAmount
    + atoms.acceptanceOperationsAmount
    + atoms.finesAmount
}

/**
 * Молекула `Перевод в банк`: выплата по продажам минус атомы расходов строк продаж.
 * Используется cell `Перевод в банк`, чистой прибылью и fallback-базой схемы работы.
 */
export function calculateWildberriesTransferToBank(
  atoms: WildberriesAccrualMetricAtoms
): number {
  return atoms.salesPayout
    - atoms.logisticsAmount
    - atoms.storageAmount
    - atoms.acceptanceOperationsAmount
    - atoms.finesAmount
    - atoms.withholdingsAmount
    + atoms.vvCorrectionAmount
}

/**
 * Молекула `Себестоимость`: отдает сумму COGS или `null`, если не найдено ни одной строки.
 * Используется cell `Себестоимость` и cell `Чистая прибыль`.
 */
export function calculateWildberriesCogs(atoms: WildberriesAccrualMetricAtoms): number | null {
  return atoms.cogsMatchedRows > 0 ? atoms.cogsFromFile : null
}
