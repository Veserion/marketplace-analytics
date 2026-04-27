export const OZON_CSV_LAYOUT = {
  delimiter: ';',
  unitHeaderFirstCell: 'SKU',
  accrualHeaderFirstCell: 'ID начисления',
  accrualHeaderSecondCell: 'Дата начисления',
} as const

export const OZON_UNIT_COLUMNS = {
  article: 'Артикул',
  orderedQty: 'Заказано товаров, шт',
  deliveredQty: 'Доставлено товаров, шт',
  returnedQty: 'Возвращено товаров, шт',
  revenue: 'Выручка',
  pointsPrimary: 'Баллы за скидки',
  pointsAlt: 'Баллы за скидки, руб.',
  partnerProgramsPrimary: 'Программы партнёров',
  partnerProgramsAlt: 'Программы партнеров',
  commissionPrimary: 'Вознаграждение Ozon',
  commissionAlt: 'Комиссия Ozon',
  acquiring: 'Эквайринг',
  periodProfit: 'Прибыль за период',
  cogs: 'Себестоимость',
  availability: 'Доступность товаров',
  salesShare: 'Доля от продаж',
  unitProfit: 'Прибыль за шт',
} as const

export const OZON_UNIT_COLUMN_GROUPS = {
  ad: [
    'Оплата за клик',
    'Оплата за заказ',
    'Звёздные товары',
    'Платный бренд',
    'Отзывы',
    'Доля от продаж',
  ],
  logistics: ['Обработка отправления', 'Логистика', 'Доставка до места выдачи'],
  reverseLogistics: ['Обработка возврата', 'Обратная логистика'],
  otherExpenses: ['Стоимость размещения', 'Утилизация', 'Дополнительная обработка ОВХ', 'Операционные ошибки'],
} as const

export const OZON_ACCRUAL_COLUMNS = {
  article: 'Артикул',
  qty: 'Количество',
  accrualType: 'Тип начисления',
  amount: 'Сумма итого, руб.',
  serviceGroup: 'Группа услуг',
  accrualDate: 'Дата начисления',
  scheme: 'Схема работы',
} as const
