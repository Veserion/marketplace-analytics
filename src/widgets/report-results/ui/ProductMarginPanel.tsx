import classNames from 'classnames/bind'
import { useMemo } from 'react'
import type { ProductMarginItem } from '@/entities/ozon-report/model/types'
import { UiDisclosure } from '@/shared/ui-kit/disclosure'
import { UiTable } from '@/shared/ui-kit/table'
import type { UiTableColumn } from '@/shared/ui-kit/table'
import { UiTooltipIcon } from '@/shared/ui-kit/tooltip'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './ProductMarginPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProductMarginPanel'
const OZON_SEARCH_URL = 'https://www.ozon.ru/search/?text='

type MarkLevel = 'risk' | 'warning' | 'normal' | 'super'

type ProductMarginPanelProps = {
  items: ProductMarginItem[]
}

type ProductMarginTableRow = ProductMarginItem & {
  markLevel: MarkLevel
}

const MARGIN_LEGEND_ITEMS: Array<{ level: MarkLevel, text: string }> = [
  { level: 'risk', text: '0-15%: высокий риск убыточности' },
  { level: 'warning', text: '15-25%: рекомендуем перепроверить экономику' },
  { level: 'normal', text: '25%+: нормальная экономика' },
  { level: 'super', text: '50%+: прибыльные товары' },
]

function getMarkByMargin(marginPercent: number): MarkLevel {
  if (marginPercent >= 50) {
    return 'super'
  }
  if (marginPercent >= 25) {
    return 'normal'
  }
  if (marginPercent >= 15) {
    return 'warning'
  }
  return 'risk'
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}%`
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'нет данных'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`
}

function buildOzonSearchUrl(article: string): string {
  return `${OZON_SEARCH_URL}${encodeURIComponent(article)}`
}

export function ProductMarginPanel({ items }: ProductMarginPanelProps) {
  const rows = useMemo<ProductMarginTableRow[]>(
    () => items.map((item) => ({ ...item, markLevel: getMarkByMargin(item.marginSharePercent) })),
    [items],
  )

  const columns = useMemo<UiTableColumn<ProductMarginTableRow>[]>(() => ([
    {
      key: 'article',
      title: 'Артикул',
      width: '20%',
      renderCell: (row) => (
        <a
          className={cn(`${BLOCK_NAME}__article-link`)}
          href={buildOzonSearchUrl(row.article)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <code className={cn(`${BLOCK_NAME}__article`)}>{row.article}</code>
        </a>
      ),
      filterable: true,
      filterPlaceholder: 'Фильтр по артикулу',
      getFilterValue: (row) => row.article,
      sortable: true,
      getSortValue: (row) => row.article,
    },
    {
      key: 'margin',
      width: '30%',
      title: (
        <span className={cn(`${BLOCK_NAME}__header-with-hint`)}>
          Маржинальность
          <UiTooltipIcon
            ariaLabel="Маржинальность без учета налогов"
            content="Маржинальность без учета налогов"
          />
        </span>
      ),
      renderCell: (row) => (
        <span className={cn(`${BLOCK_NAME}__margin-cell`, `${BLOCK_NAME}__margin-cell--${row.markLevel}`)}>
          <span className={cn(`${BLOCK_NAME}__value-strong`)}>
          {formatPercent(row.marginSharePercent)}
          </span>
        </span>
      ),
      filterable: true,
      filterPlaceholder: 'Фильтр по маржинальности',
      getFilterValue: (row) => formatPercent(row.marginSharePercent),
      sortable: true,
      getSortValue: (row) => row.marginSharePercent,
    },
    {
      key: 'profit',
      title: 'Прибыль',
      width: '25%',
      renderCell: (row) => <span>{formatCurrency(row.profitPerUnit)}</span>,
      filterable: true,
      filterPlaceholder: 'Фильтр по прибыли',
      getFilterValue: (row) => formatCurrency(row.profitPerUnit),
      sortable: true,
      getSortValue: (row) => row.profitPerUnit,
    },
  ]), [])

  return (
    <section className={cn(BLOCK_NAME)}>
      <UiDisclosure
        contentInnerClassName={cn(`${BLOCK_NAME}__content`)}
        title={<Typography variant="h5" color="accent">Потоварная маржинальность</Typography>}
      >
          <div className={cn(`${BLOCK_NAME}__legend`)}>
            {MARGIN_LEGEND_ITEMS.map((item) => (
              <span
                key={item.level}
                className={cn(`${BLOCK_NAME}__legend-item`, `${BLOCK_NAME}__legend-item--${item.level}`)}
              >
                {item.text}
              </span>
            ))}
          </div>
          <UiTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.article}
            initialSort={{ key: 'margin', direction: 'asc' }}
            showHeaderFilters={false}
            emptyText='Нет данных в колонках "Доля от продаж" / "Прибыль за шт"'
          />
      </UiDisclosure>
    </section>
  )
}
