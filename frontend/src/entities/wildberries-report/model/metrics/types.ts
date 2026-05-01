import type { WbWeeklySlot } from '../weekly-report-utils'

export type WildberriesAccrualRow = {
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

export type WildberriesSalesScheme = 'FBS' | 'FBW' | 'Не указано'

export type WbUploadedReport = {
  id: string
  slot: WbWeeklySlot
  fileName: string
  csvText: string
  periodStart: string | null
  periodEnd: string | null
  uploadedAt: number
  status: 'ready' | 'error'
  errorMessage?: string
}

export type WildberriesAccrualMetricAtoms = {
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
