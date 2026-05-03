import type { WildberriesAccrualRow } from './metrics/types'
import { normalize, parseNumber } from '@/shared/lib/csv'

/**
 * Сырая строка отчёта Wildberries, полученная по API.
 * Поля могут быть null — адаптер применяет fallback-значения при маппинге.
 *
 * Числовые поля API приходят как строки (например "47.43"), адаптер преобразует их в числа.
 *
 * Таблица сопоставления CSV ↔ API: wb-csv-to-api-fields.md
 *
 * Используемые поля для расчёта метрик:
 * - vendorCode → article
 * - docTypeName → documentType
 * - sellerOperName → reason
 * - saleDt → salesDate
 * - deliveryMethod → salesMethod
 * - officeName → warehouse
 * - orderUid → basketId
 * - srid → srid
 * - bonusTypeName → logisticsKind
 * - quantity → quantity
 * - returnAmount → returnCount
 * - deliveryAmount → deliveryCount
 * - retailPrice → retailPrice
 * - retailPriceWithDisc → retailPriceWithDiscount
 * - retailAmount → sellerRealized
 * - forPay → payout
 * - deliveryService → logisticsCost
 * - commissionPercent → wbCommissionRate
 * - vw → wbCommission
 * - acquiringFee → paymentServicesCommission
 * - ppvzReward → pvzCompensation
 * - rebillLogisticCost → transportReimbursement
 * - paidStorage → storageCost
 * - deduction → withholdings
 * - paidAcceptance → acceptanceOperations
 * - penalty → fines
 * - additionalPayment → vvCorrection
 * - cashbackDiscount → loyaltyCompensation
 * - cashbackCommissionChange → loyaltyProgramCost
 * - cashbackAmount → loyaltyPointsWithheld
 */
export type WbApiReportRow = {
  vendorCode: string | null
  docTypeName: string | null
  sellerOperName: string | null
  saleDt: string | null
  deliveryMethod: string | null
  officeName: string | null
  orderUid: string | null
  srid: string | null
  bonusTypeName: string | null
  quantity: number | null
  returnAmount: number | null
  deliveryAmount: number | null
  retailPrice: string | null
  retailPriceWithDisc: string | null
  retailAmount: string | null
  forPay: string | null
  deliveryService: string | null
  commissionPercent: number | null
  vw: string | null
  acquiringFee: string | null
  ppvzReward: string | null
  rebillLogisticCost: string | null
  paidStorage: string | null
  deduction: string | null
  paidAcceptance: string | null
  penalty: string | null
  additionalPayment: string | null
  cashbackDiscount: string | null
  cashbackCommissionChange: string | null
  cashbackAmount: string | null
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
 *
 * Числовые поля API приходят как строки (например "47.43"), поэтому
 * используется parseNumber для преобразования в числа.
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
    srid: api.srid ?? '',
    logisticsKind: normalize(api.bonusTypeName ?? ''),
    quantity: api.quantity ?? 0,
    returnCount: api.returnAmount ?? 0,
    deliveryCount: api.deliveryAmount ?? 0,
    retailPrice: parseNumber(api.retailPrice) ?? 0,
    retailPriceWithDiscount: parseNumber(api.retailPriceWithDisc) ?? 0,
    sellerRealized: parseNumber(api.retailAmount) ?? 0,
    payout: parseNumber(api.forPay) ?? 0,
    logisticsCost: parseNumber(api.deliveryService) ?? 0,
    wbCommissionRate: api.commissionPercent ?? 0,
    wbCommission: parseNumber(api.vw) ?? 0,
    paymentServicesCommission: parseNumber(api.acquiringFee) ?? 0,
    pvzCompensation: parseNumber(api.ppvzReward) ?? 0,
    transportReimbursement: parseNumber(api.rebillLogisticCost) ?? 0,
    storageCost: parseNumber(api.paidStorage) ?? 0,
    withholdings: parseNumber(api.deduction) ?? 0,
    acceptanceOperations: parseNumber(api.paidAcceptance) ?? 0,
    fines: parseNumber(api.penalty) ?? 0,
    vvCorrection: parseNumber(api.additionalPayment) ?? 0,
    loyaltyCompensation: parseNumber(api.cashbackDiscount) ?? 0,
    loyaltyProgramCost: parseNumber(api.cashbackCommissionChange) ?? 0,
    loyaltyPointsWithheld: parseNumber(api.cashbackAmount) ?? 0,
  }
}

/**
 * Маппит массив API-строк в массив WildberriesAccrualRow.
 */
export function mapWbApiRowsToAccrualRows(apiRows: WbApiReportRow[]): WildberriesAccrualRow[] {
  return apiRows.map(mapWbApiRowToAccrualRow)
}

/**
 * Конвертирует массив WildberriesAccrualRow в CSV формат.
 * Используется для интеграции API данных в существующий флоу обработки CSV.
 */
export function accrualRowsToCsv(rows: WildberriesAccrualRow[]): string {
  if (rows.length === 0) return ''

  // Заголовок WB CSV
  const header = [
    'Артикул',
    'Тип документа',
    'Обоснование для оплаты',
    'Дата продажи',
    'Способ продажи и тип товара',
    'Склад',
    'ID корзины заказа',
    'Srid',
    'Вид логистики',
    'Количество',
    'Возвраты',
    'Доставка',
    'Цена розничная',
    'Цена розничная с учетом скидки',
    'Реализовано продавцу',
    'К перечислению',
    'Логистика до покупателя',
    'Комиссия ВБ, %',
    'Комиссия ВБ',
    'Эквайринг',
    'Компенсация ПВЗ',
    'Транспортная компенсация',
    'Хранение ФБО',
    'Удержания',
    'Операции на приемке',
    'Штрафы',
    'Корректировка ВВ',
    'Компенсация лояльности',
    'Стоимость программы лояльности',
    'Списание лояльных баллов',
  ]

  // Функция экранирования CSV значений
  const escapeCsvValue = (value: string | number): string => {
    const str = String(value)
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  // Конвертация строк
  const dataRows = rows.map((row) => [
    escapeCsvValue(row.article),
    escapeCsvValue(row.documentType),
    escapeCsvValue(row.reason),
    escapeCsvValue(row.salesDate),
    escapeCsvValue(row.salesMethod),
    escapeCsvValue(row.warehouse),
    escapeCsvValue(row.basketId),
    escapeCsvValue(row.srid),
    escapeCsvValue(row.logisticsKind),
    escapeCsvValue(row.quantity),
    escapeCsvValue(row.returnCount),
    escapeCsvValue(row.deliveryCount),
    escapeCsvValue(row.retailPrice),
    escapeCsvValue(row.retailPriceWithDiscount),
    escapeCsvValue(row.sellerRealized),
    escapeCsvValue(row.payout),
    escapeCsvValue(row.logisticsCost),
    escapeCsvValue(row.wbCommissionRate),
    escapeCsvValue(row.wbCommission),
    escapeCsvValue(row.paymentServicesCommission),
    escapeCsvValue(row.pvzCompensation),
    escapeCsvValue(row.transportReimbursement),
    escapeCsvValue(row.storageCost),
    escapeCsvValue(row.withholdings),
    escapeCsvValue(row.acceptanceOperations),
    escapeCsvValue(row.fines),
    escapeCsvValue(row.vvCorrection),
    escapeCsvValue(row.loyaltyCompensation),
    escapeCsvValue(row.loyaltyProgramCost),
    escapeCsvValue(row.loyaltyPointsWithheld),
  ])

  // Специальный заголовок WB CSV (первые две строки)
  const wbHeader1 = ['№', 'Артикул поставщика', 'Бренд', 'Предмет', 'Код товара', 'Размер', 'Баркод']
  const wbHeader2 = [
    'Число',
    'Артикул поставщика',
    'Бренд',
    'Предмет',
    'Код товара',
    'Размер',
    'Баркод',
    ...header.slice(1),
  ]

  return [
    wbHeader1.join(';'),
    wbHeader2.join(';'),
    ...dataRows.map((row) => row.join(';')),
  ].join('\n')
}
