import type { MetricView } from '../types/reports'

export const METRICS: MetricView[] = [
  { key: 'sales', label: 'Продажи', formula: 'SUM("Заказано товаров, шт")', type: 'number' },
  { key: 'returns', label: 'Возвраты', formula: 'SUM("Возвращено товаров, шт")', type: 'number' },
  { key: 'buyout', label: 'Выкуплено', formula: 'SUM(Доставлено - Возвращено)', type: 'number' },
  { key: 'buyoutRate', label: '% выкупа', formula: 'Выкуплено / Продажи * 100%', type: 'percent' },
  { key: 'revenueBeforeSpp', label: 'Выручка до СПП', formula: 'SUM("Выручка")', type: 'currency' },
  { key: 'commission', label: 'Комиссия', formula: 'SUM("Вознаграждение Ozon")', type: 'currency' },
  { key: 'logistics', label: 'Логистика', formula: 'SUM("Логистика")', type: 'currency' },
  { key: 'acquiring', label: 'Эквайринг', formula: 'SUM("Эквайринг")', type: 'currency' },
  { key: 'tax', label: 'Налог (11%)', formula: 'SUM("Выручка") * 11%', type: 'currency' },
  { key: 'cogs', label: 'Себестоимость', formula: 'SUM("Себестоимость" * ("Доставлено" - "Возвращено"))', type: 'currency' },
  {
    key: 'adsCost',
    label: 'Расход на рекламу',
    formula: 'SUM(Оплата за клик + Оплата за заказ + Звёздные товары + Платный бренд + Отзывы + Доля от продаж)',
    type: 'currency',
  },
  {
    key: 'otherExpenses',
    label: 'Прочие расходы',
    formula: 'SUM(Обработка отправления + Доставка до места выдачи + Стоимость размещения + Обработка возврата + Обратная логистика + Утилизация + Дополнительная обработка ОВХ + Операционные ошибки)',
    type: 'currency',
  },
  {
    key: 'netRevenue',
    label: 'Чистая выручка',
    formula: 'SUM("Прибыль за период") - Налог (11%)',
    type: 'currency',
  },
  { key: 'marginRate', label: 'Маржинальность, %', formula: 'Чистая выручка / Выручка * 100%', type: 'percent' },
  { key: 'drr', label: 'ДРР продвижения, %', formula: 'Расход на рекламу / Выручка * 100%', type: 'percent' },
]

export const AD_COLS = ['Оплата за клик', 'Оплата за заказ', 'Звёздные товары', 'Платный бренд', 'Отзывы', 'Доля от продаж']

export const OTHER_EXPENSE_COLS = [
  'Обработка отправления',
  'Доставка до места выдачи',
  'Стоимость размещения',
  'Обработка возврата',
  'Обратная логистика',
  'Утилизация',
  'Дополнительная обработка ОВХ',
  'Операционные ошибки',
]
