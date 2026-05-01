import type { WildberriesAccrualRow } from './metrics/types'
import { normalize } from '@/shared/lib/csv'

/**
 * Сырая строка отчёта Wildberries, полученная по API.
 * Поля могут быть null — адаптер применяет fallback-значения при маппинге.
 *
 * Таблица сопоставления CSV ↔ API: wb-csv-to-api-fields.md
 */
export type WbApiReportRow = {
  rrdId: number | null
  giId: number | null
  subjectName: string | null
  nmId: number | null
  brandName: string | null
  vendorCode: string | null
  title: string | null
  techSize: string | null
  sku: number | null
  docTypeName: string | null
  sellerOperName: string | null
  orderDt: string | null
  saleDt: string | null
  quantity: number | null
  retailPrice: number | null
  retailAmount: number | null
  productDiscountForReport: number | null
  sellerPromo: number | null
  salePercent: number | null
  retailPriceWithDisc: number | null
  supRatingUp: number | null
  isKgvpV2: number | null
  spp: number | null
  commissionPercent: number | null
  kvwBase: number | null
  kvw: number | null
  ppvzSalesCommission: number | null
  ppvzReward: number | null
  acquiringFee: number | null
  acquiringPercent: number | null
  paymentProcessing: string | null
  vw: number | null
  vwNds: number | null
  forPay: number | null
  deliveryAmount: number | null
  returnAmount: number | null
  deliveryService: number | null
  fixTariffDateFrom: string | null
  fixTariffDateTo: string | null
  dlvPrc: number | null
  penalty: number | null
  additionalPayment: number | null
  bonusTypeName: string | null
  stickerId: string | null
  acquiringBank: string | null
  ppvzOfficeId: string | null
  ppvzOfficeName: string | null
  ppvzSupplierInn: string | null
  ppvzSupplierName: string | null
  officeName: string | null
  country: string | null
  giBoxTypeName: string | null
  declarationNumber: string | null
  orderId: number | null
  kiz: string | null
  shkId: string | null
  srid: number | null
  rebillLogisticCost: number | null
  rebillLogisticOrg: string | null
  paidStorage: number | null
  deduction: number | null
  paidAcceptance: number | null
  isB2b: boolean | null
  trbxId: string | null
  installmentCofinancingAmount: number | null
  wibesDiscountPercent: number | null
  cashbackDiscount: number | null
  cashbackCommissionChange: number | null
  cashbackAmount: number | null
  orderUid: string | null
  paymentSchedule: number | null
  sellerPromoId: number | null
  sellerPromoDiscount: number | null
  deliveryMethod: string | null
  loyaltyId: number | null
  loyaltyDiscount: number | null
  uuidPromocode: string | null
  salePricePromocodeDiscountPrc: number | null
  articleSubstitution: number | null
  salePriceAffiliatedDiscountPrc: number | null
  salePriceWholesaleDiscountPrc: number | null
}

/**
 * Преобразует ISO-дату из API (например "2024-03-15T00:00:00")
 * в формат DD.MM.YYYY, используемый в CSV и downstream-логике.
 * Если формат не распознаётся — возвращает исходную строку.
 */
function formatApiDateToCsvStyle(raw: string | null): string {
  if (!raw) return ''
  const ts = Date.parse(raw)
  if (Number.isNaN(ts)) return raw
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ts))
}

/**
 * Маппит строку отчёта WB API в доменную модель WildberriesAccrualRow,
 * которая используется downstream-расчётами (aggregate, atoms, cells).
 *
 * Применяет те же fallback-значения (0 для чисел, '' для строк),
 * что и CSV-парсер в parseWildberriesRowsFromTable.
 */
export function mapWbApiRowToAccrualRow(api: WbApiReportRow): WildberriesAccrualRow {
  return {
    article: normalize(api.vendorCode ?? ''),
    documentType: normalize(api.docTypeName ?? ''),
    reason: normalize(api.sellerOperName ?? ''),
    salesDate: formatApiDateToCsvStyle(api.saleDt),
    salesMethod: normalize(api.deliveryMethod ?? ''),
    warehouse: normalize(api.officeName ?? ''),
    basketId: normalize(api.orderUid ?? ''),
    srid: api.srid != null ? String(api.srid) : '',
    logisticsKind: normalize(api.bonusTypeName ?? ''),
    quantity: api.quantity ?? 0,
    returnCount: api.returnAmount ?? 0,
    deliveryCount: api.deliveryAmount ?? 0,
    retailPrice: api.retailPrice ?? 0,
    retailPriceWithDiscount: api.retailPriceWithDisc ?? 0,
    sellerRealized: api.retailAmount ?? 0,
    payout: api.forPay ?? 0,
    logisticsCost: api.deliveryService ?? 0,
    wbCommissionRate: api.commissionPercent ?? 0,
    wbCommission: api.vw ?? 0,
    paymentServicesCommission: api.acquiringFee ?? 0,
    pvzCompensation: api.ppvzReward ?? 0,
    transportReimbursement: api.rebillLogisticCost ?? 0,
    storageCost: api.paidStorage ?? 0,
    withholdings: api.deduction ?? 0,
    acceptanceOperations: api.paidAcceptance ?? 0,
    fines: api.penalty ?? 0,
    vvCorrection: api.additionalPayment ?? 0,
    loyaltyCompensation: api.cashbackDiscount ?? 0,
    loyaltyProgramCost: api.cashbackCommissionChange ?? 0,
    loyaltyPointsWithheld: api.cashbackAmount ?? 0,
  }
}

/**
 * Маппит массив API-строк в массив WildberriesAccrualRow.
 */
export function mapWbApiRowsToAccrualRows(apiRows: WbApiReportRow[]): WildberriesAccrualRow[] {
  return apiRows.map(mapWbApiRowToAccrualRow)
}
