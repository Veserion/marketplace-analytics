import type { MetricView } from '@/entities/ozon-report/model/types'

export const METRICS: MetricView[] = [
  { key: 'sales', label: 'Продажи', formula: 'SUM("Заказано товаров, шт")', type: 'number' },
  { key: 'buyout', label: 'Выкуплено', formula: 'SUM(Доставлено - Возвращено)', type: 'number' },
  { key: 'returns', label: 'Возвраты', formula: 'SUM("Возвращено товаров, шт")', type: 'number' },
  { key: 'buyoutRate', label: '% выкупа', formula: '100% * Выкуплено / (Выкуплено + Отказы)', type: 'percent' },
  { key: 'cancellations', label: 'Отмены', formula: 'Отмены не отображены в данном документе (всегда "-")', type: 'number' },
  { key: 'revenueBeforeSpp', label: 'Выручка до СПП', formula: 'SUM("Выручка") + SUM("Баллы за скидки") + SUM("Программы партнёров")', type: 'currency' },
  { key: 'revenueAfterSpp', label: 'Выручка после СПП', formula: 'SUM("Выручка")', type: 'currency' },
  { key: 'accruedPoints', label: 'Баллы за СПП', formula: 'SUM("Баллы за скидки")', type: 'currency' },
  { key: 'partnerCompensation', label: 'Компенсация прог.партнеров', formula: 'SUM("Программы партнёров")', type: 'currency' },
  { key: 'commission', label: 'Комиссия', formula: 'Сумма: SUM("Комиссия Ozon"), доля: ABS(Комиссия) / Выручка до СПП * 100%', type: 'currency' },
  { key: 'logistics', label: 'Логистика', formula: 'Сумма: SUM("Обработка отправления" + "Логистика" + "Доставка до места выдачи"), доля: ABS(Логистика) / Выручка до СПП * 100%', type: 'currency' },
  { key: 'reverseLogistics', label: 'Обратная логистика', formula: 'SUM("Обработка возврата" + "Обратная логистика")', type: 'currency' },
  { key: 'acquiring', label: 'Эквайринг', formula: 'Сумма: SUM("Эквайринг"), доля: ABS(Эквайринг) / Выручка до СПП * 100%', type: 'currency' },
  {
    key: 'adsCost',
    label: 'Расход на рекламу',
    formula: 'Сумма: SUM(Оплата за клик + Оплата за заказ + Звёздные товары + Платный бренд + Отзывы + Доля от продаж), доля: ABS(Расход на рекламу) / Выручка до СПП * 100%',
    type: 'currency',
  },
  {
    key: 'otherExpenses',
    label: 'Прочие расходы',
    formula: 'SUM(Стоимость размещения + Утилизация + Дополнительная обработка ОВХ + Операционные ошибки)',
    type: 'currency',
  },
  { key: 'tax', label: 'Общий налог', formula: 'Налог + НДС', type: 'currency' },
  { key: 'cogs', label: 'Себестоимость', formula: 'SUM("Себестоимость" * ("Доставлено" - "Возвращено"))', type: 'currency' },
  {
    key: 'netRevenue',
    label: 'Чистая выручка',
    formula: 'SUM("Прибыль за период") - Общий налог',
    type: 'currency',
  },
  { key: 'marginRate', label: 'Маржинальность, %', formula: 'Чистая выручка / Выручка * 100%', type: 'percent' },
]

export const AD_COLS = ['Оплата за клик', 'Оплата за заказ', 'Звёздные товары', 'Платный бренд', 'Отзывы', 'Доля от продаж']

export const OTHER_EXPENSE_COLS = [
  'Стоимость размещения',
  'Утилизация',
  'Дополнительная обработка ОВХ',
  'Операционные ошибки',
]

export const LOGISTICS_COLS = ['Обработка отправления', 'Логистика', 'Доставка до места выдачи']

export const REVERSE_LOGISTICS_COLS = ['Обработка возврата', 'Обратная логистика']
