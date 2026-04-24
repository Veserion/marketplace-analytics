import type { MetricView } from '@/entities/ozon-report/model/types'

export const METRICS: MetricView[] = [
  { key: 'sales', label: 'Продажи', formula: 'SUM("Заказано товаров, шт")', type: 'number' },
  { key: 'buyout', label: 'Выкуплено', formula: 'SUM(Доставлено - Возвращено)', type: 'number' },
  { key: 'returns', label: 'Возвраты', formula: 'SUM("Возвращено товаров, шт")', type: 'number' },
  { key: 'buyoutRate', label: '% выкупа', formula: '100% * Выкуплено / (Выкуплено + Возвраты)', type: 'percent' },
  { key: 'cancellations', label: 'Отмены', formula: 'Отмены не отображены в данном документе (всегда "-")', type: 'number' },
  { key: 'revenueBeforeSpp', label: 'Выручка с учетом СПП', formula: 'SUM("Выручка") + SUM("Баллы за скидки") + SUM("Программы партнёров")', type: 'currency' },
  { key: 'revenueAfterSpp', label: 'Выручка после СПП', formula: 'SUM("Выручка")', type: 'currency' },
  { key: 'accruedPoints', label: 'Баллы за СПП', formula: 'SUM("Баллы за скидки") или SUM("Баллы за скидки, руб.")', type: 'currency' },
  { key: 'partnerCompensation', label: 'Компенсация прог.партнеров', formula: 'SUM("Программы партнёров") или SUM("Программы партнеров")', type: 'currency' },
  { key: 'commission', label: 'Комиссия', formula: 'SUM("Вознаграждение Ozon") или SUM("Комиссия Ozon")', type: 'currency' },
  { key: 'logistics', label: 'Логистика', formula: 'SUM("Обработка отправления" + "Логистика" + "Доставка до места выдачи")', type: 'currency' },
  { key: 'reverseLogistics', label: 'Обратная логистика', formula: 'SUM("Обработка возврата" + "Обратная логистика")', type: 'currency' },
  { key: 'acquiring', label: 'Эквайринг', formula: 'SUM("Эквайринг")', type: 'currency' },
  {
    key: 'adsCost',
    label: 'Расход на рекламу',
    formula: 'SUM(Оплата за клик + Оплата за заказ + Звёздные товары + Платный бренд + Отзывы + Доля от продаж)',
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
