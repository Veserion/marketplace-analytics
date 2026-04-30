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

export type WildberriesAccrualMetricAtoms = {
  salesQuantity: number
  returnsAndCancellationsQuantity: number
  returnsQuantity: number
  salesRevenueByRetailPrice: number
  salesRevenueBeforeSpp: number
  returnsRevenueBeforeSpp: number
  revenueWithoutSpp: number
  salesPayout: number
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
  salesLogisticsAmount: number
  salesStorageAmount: number
  salesWithholdingsAmount: number
  salesAcceptanceOperationsAmount: number
  salesFinesAmount: number
  cogsFromFile: number
  cogsMatchedRows: number
}
