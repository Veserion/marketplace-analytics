export const WB_CSV_LAYOUT = {
  delimiter: ';',
  cogsFallbackDelimiter: ',',
  headerFirstCell: '№',
  headerSecondCell: 'Номер поставки',
} as const

export const WB_COGS_COLUMNS = {
  article: 'Артикул',
  cogs: 'Себестоимость',
} as const

export const WB_BASE_COLUMNS = {
  article: 'Артикул поставщика',
  nomenclatureCode: 'Код номенклатуры',
  documentType: 'Тип документа',
  reason: 'Обоснование для оплаты',
  salesDate: 'Дата продажи',
  salesMethod: 'Способы продажи и тип товара',
  warehouse: 'Склад',
  basketId: 'Id корзины заказа',
  srid: 'Srid',
  logisticsKind: 'Виды логистики, штрафов и корректировок ВВ',
} as const

export const WB_QUANTITY_COLUMNS = {
  qty: 'Кол-во',
  returnQty: 'Количество возврата',
  deliveryQty: 'Количество доставок',
} as const

export const WB_REVENUE_COLUMNS = {
  retailPrice: 'Цена розничная',
  retailPriceWithDiscount: 'Цена розничная с учетом согласованной скидки',
  sellerRealized: 'Вайлдберриз реализовал Товар (Пр)',
  payout: 'К перечислению Продавцу за реализованный Товар',
} as const

export const WB_EXPENSE_COLUMNS = {
  wbCommission: 'Вознаграждение Вайлдберриз (ВВ), без НДС',
  logisticsToBuyer: 'Услуги по доставке товара покупателю',
  paymentServices: 'Компенсация платёжных услуг/Комиссия за интеграцию платёжных сервисов',
  pvzCompensation: 'Возмещение за выдачу и возврат товаров на ПВЗ',
  transportReimbursement: 'Возмещение издержек по перевозке/по складским операциям с товаром',
  storage: 'Хранение',
  withholdings: 'Удержания',
  acceptanceOperations: 'Операции на приемке',
  fines: 'Общая сумма штрафов',
  vvCorrection: 'Корректировка Вознаграждения Вайлдберриз (ВВ)',
} as const

export const WB_LOYALTY_COLUMNS = {
  loyaltyCompensation: 'Компенсация скидки по программе лояльности',
  loyaltyProgramCost: 'Стоимость участия в программе лояльности',
  loyaltyPointsWithheld: 'Сумма удержанная за начисленные баллы программы лояльности',
} as const
