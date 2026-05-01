import { WILDBERRIES_ACCRUAL_ATOM_FORMULAS } from '@/entities/wildberries-report/model/metrics/atoms'
import { calculateWildberriesCogs, calculateWildberriesMarketplaceExpenses, calculateWildberriesRevenueBeforeSpp, calculateWildberriesSppAndPromotions, calculateWildberriesTransferToBank, calculateWildberriesWbCommissionAmount, WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS } from '@/entities/wildberries-report/model/metrics/molecules'
import type { WildberriesAccrualMetricAtoms } from '@/entities/wildberries-report/model/metrics/types'

export type WildberriesAccrualCells = {
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

export const WILDBERRIES_ACCRUAL_CELL_FORMULAS = {
  salesQuantity: WILDBERRIES_ACCRUAL_ATOM_FORMULAS.salesQuantity,
  cancellationsAndNonPickupsQuantity: WILDBERRIES_ACCRUAL_ATOM_FORMULAS.returnsAndCancellationsQuantity,
  returnsQuantity: WILDBERRIES_ACCRUAL_ATOM_FORMULAS.returnsQuantity,
  revenueBeforeSpp: WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.revenueBeforeSpp,
  revenueWithoutSpp: WILDBERRIES_ACCRUAL_ATOM_FORMULAS.revenueWithoutSpp,
  sppAndPromotions: WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.sppAndPromotions,
  wbCommissionAmount: WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.wbCommissionAmount,
  marketplaceExpenses: WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.marketplaceExpenses,
  transferToBank: WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.transferToBank,
  cogsWithData: WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.cogs,
  cogsWithoutData: `Нет данных: ожидаемая формула ${WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.cogs}; загрузите CSV с себестоимостью товаров.`,
} as const

/**
 * Cell-расчет `Налог`: применяет ставки к молекуле `Выручка с учетом СПП`.
 * Используется финальной строкой `Налог`.
 */
export function calculateWildberriesTaxAmountCell(
  revenueBeforeSpp: number,
  vatRatePercent: number,
  taxRatePercent: number,
): number {
  if (revenueBeforeSpp === 0) return 0
  return revenueBeforeSpp * ((vatRatePercent + taxRatePercent) / 100)
}

/**
 * Cell-расчет `Чистая прибыль`: перевод в банк минус налог и себестоимость, если она есть.
 * Используется финальной строкой `Чистая прибыль`.
 */
export function calculateWildberriesNetProfitCell(
  transferToBank: number,
  taxAmount: number,
  cogs: number | null,
): number {
  return transferToBank - taxAmount - (cogs ?? 0)
}

/**
 * Cell-расчет `Маржинальность`: чистая прибыль относительно выручки с СПП.
 * Используется финальной строкой `Маржинальность`.
 */
export function calculateWildberriesMarginRateCell(
  netProfit: number,
  revenueBeforeSpp: number,
): number | null {
  if (revenueBeforeSpp === 0) return null
  return (netProfit / revenueBeforeSpp) * 100
}

/**
 * Cell-расчет базы продаж для процентов расходов.
 * Используется `shareText` в итогах и группах расходов.
 */
export function calculateWildberriesSalesBaseCell(transferToBank: number, marketplaceExpenses: number): number | null {
  const base = transferToBank + marketplaceExpenses
  return base > 0 ? base : null
}

/**
 * Формирует пользовательскую формулу для cell `Налог` с фактическими ставками отчета.
 * Используется презентационным слоем `buildWildberriesAccrualReportGroups`.
 */
export function getWildberriesTaxCellFormula(vatRatePercent: number, taxRatePercent: number): string {
  return `((${taxRatePercent}% + ${vatRatePercent}%) / 100) * (${WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.revenueBeforeSpp})`
}

/**
 * Выбирает формулу cell `Чистая прибыль` в зависимости от наличия данных себестоимости.
 * Используется презентационным слоем `buildWildberriesAccrualReportGroups`.
 */
export function getWildberriesNetProfitCellFormula(
  hasCogs: boolean,
  vatRatePercent: number,
  taxRatePercent: number,
): string {
  const taxFormula = getWildberriesTaxCellFormula(vatRatePercent, taxRatePercent)
  return hasCogs
    ? `(${WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.transferToBank}) - (${taxFormula}) - (${WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.cogs})`
    : `(${WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.transferToBank}) - (${taxFormula})`
}

export function getWildberriesMarginRateCellFormula(
  hasCogs: boolean,
  vatRatePercent: number,
  taxRatePercent: number,
): string {
  const netProfitFormula = getWildberriesNetProfitCellFormula(hasCogs, vatRatePercent, taxRatePercent)
  return `((${netProfitFormula}) / (${WILDBERRIES_ACCRUAL_MOLECULE_FORMULAS.revenueBeforeSpp})) * 100%`
}

/**
 * Собирает финальные WB accrual cells из атомов, молекул и cell-формул.
 * Используется builder-ом отчета как единая точка получения значений для группы `Итоги периода`.
 */
export function buildWildberriesAccrualCells(
  atoms: WildberriesAccrualMetricAtoms,
  vatRatePercent: number,
  taxRatePercent: number,
): WildberriesAccrualCells {
  const revenueBeforeSpp = calculateWildberriesRevenueBeforeSpp(atoms)
  const transferToBank = calculateWildberriesTransferToBank(atoms)
  const cogs = calculateWildberriesCogs(atoms)
  const taxAmount = calculateWildberriesTaxAmountCell(revenueBeforeSpp, vatRatePercent, taxRatePercent)
  const netProfit = calculateWildberriesNetProfitCell(transferToBank, taxAmount, cogs)
  const marketplaceExpenses = calculateWildberriesMarketplaceExpenses(atoms)
  const salesBase = calculateWildberriesSalesBaseCell(transferToBank, marketplaceExpenses)

  if (import.meta.env.DEV) {
    const salesAndReturnsForBank = salesBase ?? 0
    const marketplaceCompensations = atoms.voluntaryCompensation + atoms.discountCompensation
    const marketplaceExpensesNet = marketplaceExpenses - marketplaceCompensations

    // 1. Верхний блок: salesAndReturnsForBank - marketplaceExpensesGross = transferToBank
    if (Math.abs(salesAndReturnsForBank - marketplaceExpenses - transferToBank) >= 0.01) {
      console.warn('[WB sync] Check 1 failed: salesAndReturnsForBank - marketplaceExpensesGross ≠ transferToBank',
        { salesAndReturnsForBank, marketplaceExpensesGross: marketplaceExpenses, transferToBank, diff: salesAndReturnsForBank - marketplaceExpenses - transferToBank })
    }
    // 2. Детальный блок расходов: marketplaceExpensesGross = sum of expense atoms
    const expenseAtomsSum = calculateWildberriesWbCommissionAmount(atoms)
      + atoms.logisticsAmount + atoms.withholdingsAmount + atoms.paymentServicesAmount
      + atoms.storageAmount + atoms.finesAmount + atoms.acceptanceOperationsAmount
    if (Math.abs(marketplaceExpenses - expenseAtomsSum) >= 0.01) {
      console.warn('[WB sync] Check 2 failed: marketplaceExpensesGross ≠ sum of expense atoms',
        { marketplaceExpensesGross: marketplaceExpenses, expenseAtomsSum, diff: marketplaceExpenses - expenseAtomsSum })
    }
    // 3. Компенсации: marketplaceCompensations = voluntaryCompensation + discountCompensation
    if (Math.abs(marketplaceCompensations - (atoms.voluntaryCompensation + atoms.discountCompensation)) >= 0.01) {
      console.warn('[WB sync] Check 3 failed: marketplaceCompensations ≠ voluntaryCompensation + discountCompensation',
        { marketplaceCompensations, voluntaryCompensation: atoms.voluntaryCompensation, discountCompensation: atoms.discountCompensation })
    }
    // 4. Net-итог маркетплейса: marketplaceExpensesNet = marketplaceExpensesGross - marketplaceCompensations
    if (Math.abs(marketplaceExpensesNet - (marketplaceExpenses - marketplaceCompensations)) >= 0.01) {
      console.warn('[WB sync] Check 4 failed: marketplaceExpensesNet ≠ marketplaceExpensesGross - marketplaceCompensations',
        { marketplaceExpensesNet, marketplaceExpensesGross: marketplaceExpenses, marketplaceCompensations })
    }
    // 5. Чистая прибыль: netProfit = transferToBank - costOfGoods - taxAmount
    if (Math.abs(netProfit - (transferToBank - (cogs ?? 0) - taxAmount)) >= 0.01) {
      console.warn('[WB sync] Check 5 failed: netProfit ≠ transferToBank - costOfGoods - taxAmount',
        { netProfit, transferToBank, costOfGoods: cogs, taxAmount, diff: netProfit - (transferToBank - (cogs ?? 0) - taxAmount) })
    }
    // 6. База структуры: structureBase = salesAndReturnsForBank
    if (salesBase !== null && Math.abs(salesBase - salesAndReturnsForBank) >= 0.01) {
      console.warn('[WB sync] Check 6 failed: structureBase ≠ salesAndReturnsForBank',
        { structureBase: salesBase, salesAndReturnsForBank })
    }
  }

  return {
    salesQuantity: atoms.salesQuantity,
    cancellationsAndNonPickupsQuantity: atoms.returnsAndCancellationsQuantity,
    returnsQuantity: atoms.returnsQuantity,
    revenueBeforeSpp,
    revenueWithoutSpp: atoms.revenueWithoutSpp,
    sppAndPromotions: calculateWildberriesSppAndPromotions(atoms),
    wbCommissionAmount: calculateWildberriesWbCommissionAmount(atoms),
    marketplaceExpenses,
    transferToBank,
    cogs,
    taxAmount,
    marginRate: calculateWildberriesMarginRateCell(netProfit, revenueBeforeSpp),
    netProfit,
    salesBase,
  }
}
