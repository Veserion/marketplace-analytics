import classNames from 'classnames/bind'
import { useMemo } from 'react'
import type { WildberriesTopProductItem } from '@/entities/wildberries-report'
import { Typography, UiTable, UiTooltipIcon } from '@/shared/ui-kit'
import type { UiTableColumn } from '@/shared/ui-kit'
import styles from './WildberriesTopProductsPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'WildberriesTopProductsPanel'

type WildberriesTopProductsPanelProps = {
  items: WildberriesTopProductItem[]
}

type WildberriesTopProductsTableRow = WildberriesTopProductItem
type WildberriesTopProductsRow = WildberriesTopProductsTableRow & { isTotal?: boolean }
const WB_PRODUCT_URL_PREFIX = 'https://www.wildberries.ru/catalog'

function formatSalesCount(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'нет данных'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}%`
}

function getCogsClassName(value: number | null): string {
  if (value === null) return cn(`${BLOCK_NAME}__cogs-amount`, `${BLOCK_NAME}__cogs-amount--muted`)
  return cn(`${BLOCK_NAME}__cogs-amount`, `${BLOCK_NAME}__cogs-amount--negative`)
}

function buildProductUrl(nomenclatureCode: string | null): string {
  const normalizedCode = (nomenclatureCode || '').trim()
  if (!normalizedCode) return 'https://www.wildberries.ru/'
  return `${WB_PRODUCT_URL_PREFIX}/${encodeURIComponent(normalizedCode)}/detail.aspx`
}

export function WildberriesTopProductsPanel({ items }: WildberriesTopProductsPanelProps) {
  const rows = useMemo<WildberriesTopProductsRow[]>(() => items, [items])
  const totals = useMemo(() => {
    const salesCountTotal = items.reduce((acc, item) => acc + item.salesCount, 0)
    const revenueAmountTotal = items.reduce((acc, item) => acc + item.revenueAmount, 0)
    const hasUnknownCogs = items.some((item) => item.cogsAmount === null)
    const cogsAmountTotal = hasUnknownCogs
      ? null
      : items.reduce((acc, item) => acc + (item.cogsAmount || 0), 0)
    return {
      salesCountTotal,
      revenueAmountTotal,
      cogsAmountTotal,
    }
  }, [items])
  const totalRow = useMemo<WildberriesTopProductsRow>(() => ({
    article: 'Итого',
    nomenclatureCode: null,
    salesCount: totals.salesCountTotal,
    revenueAmount: totals.revenueAmountTotal,
    revenueSharePercent: 100,
    cogsAmount: totals.cogsAmountTotal,
    salesSharePercent: 0,
    cumulativeSalesSharePercent: 0,
    salesShareLevel: 'super',
    isTotal: true,
  }), [totals.cogsAmountTotal, totals.revenueAmountTotal, totals.salesCountTotal])

  const columns = useMemo<UiTableColumn<WildberriesTopProductsRow>[]>(() => ([
    {
      key: 'article',
      title: 'Артикул',
      width: '30%',
      renderCell: (row) => (
        row.isTotal
          ? <span className={cn(`${BLOCK_NAME}__total-label`)}>{row.article}</span>
          : (
        <a
          className={cn(`${BLOCK_NAME}__article-link`)}
          href={buildProductUrl(row.nomenclatureCode)}
          target='_blank'
          rel='noopener noreferrer'
        >
          <code className={cn(`${BLOCK_NAME}__article`)}>{row.article}</code>
        </a>
            )
      ),
      filterable: true,
      filterPlaceholder: 'Фильтр по артикулу',
      getFilterValue: (row) => row.article,
      sortable: true,
      getSortValue: (row) => row.article,
    },
    {
      key: 'salesCount',
      title: (
        <span className={cn(`${BLOCK_NAME}__header-with-hint`)}>
          Кол-во, шт
          <UiTooltipIcon
            ariaLabel='ABC-группировка по накопленной доле продаж'
            content='Цвет: по накопленной доле продаж (ABC+D): 0-50% — super, 50-80% — normal, 80-95% — warning, 95-100% — risk.'
          />
        </span>
      ),
      width: '14%',
      renderCell: (row) => (
        <span className={cn(
          `${BLOCK_NAME}__sales-cell`,
          !row.isTotal && `${BLOCK_NAME}__sales-cell--${row.salesShareLevel}`,
        )}
        title={row.isTotal ? undefined : `Доля: ${row.salesSharePercent.toFixed(2)}%. Накопленная доля: ${row.cumulativeSalesSharePercent.toFixed(2)}%.`}
        >
          <span className={cn(`${BLOCK_NAME}__sales-count`)}>{formatSalesCount(row.salesCount)}</span>
        </span>
      ),
      filterable: true,
      filterPlaceholder: 'Фильтр по продажам',
      getFilterValue: (row) => formatSalesCount(row.salesCount),
      sortable: true,
      getSortValue: (row) => row.salesCount,
    },
    {
      key: 'revenueAmount',
      title: 'Выручка, ₽',
      width: '18%',
      renderCell: (row) => <span className={cn(`${BLOCK_NAME}__revenue-amount`)}>{formatCurrency(row.revenueAmount)}</span>,
      filterable: true,
      filterPlaceholder: 'Фильтр по выручке',
      getFilterValue: (row) => formatCurrency(row.revenueAmount),
      sortable: true,
      getSortValue: (row) => row.revenueAmount,
    },
    {
      key: 'revenueSharePercent',
      title: 'Доля от выручки',
      width: '18%',
      renderCell: (row) => <span className={cn(`${BLOCK_NAME}__revenue-share`)}>{formatPercent(row.revenueSharePercent)}</span>,
      filterable: true,
      filterPlaceholder: 'Фильтр по доле',
      getFilterValue: (row) => formatPercent(row.revenueSharePercent),
      sortable: true,
      getSortValue: (row) => row.revenueSharePercent,
    },
    {
      key: 'cogsAmount',
      title: (
        <span className={cn(`${BLOCK_NAME}__header-with-hint`)}>
          Себестоимость
          <UiTooltipIcon
            ariaLabel='Формула себестоимости'
            content='Себестоимость проданных единиц по артикулу: себестоимость из загруженного CSV × количество продаж.'
          />
        </span>
      ),
      width: '20%',
      renderCell: (row) => (
        <span className={getCogsClassName(row.cogsAmount)}>
          {formatCurrency(row.cogsAmount)}
        </span>
      ),
      filterable: true,
      filterPlaceholder: 'Фильтр по себестоимости',
      getFilterValue: (row) => formatCurrency(row.cogsAmount),
      sortable: true,
      getSortValue: (row) => row.cogsAmount,
    },
  ]), [])

  return (
    <section className={cn(BLOCK_NAME)}>
      <details className={cn(`${BLOCK_NAME}__details`)}>
        <summary className={cn(`${BLOCK_NAME}__summary`)}>
          <Typography variant='h5' color='accent'>Все товары по количеству продаж</Typography>
          <svg className={cn(`${BLOCK_NAME}__expand-icon`)} width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
            <path d='M15.8327 7L9.99935 12.8333L4.16602 7' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'/>
          </svg>
        </summary>

        <div className={cn(`${BLOCK_NAME}__content`)}>
          <Typography variant='body3' color='muted'>
            Сортировка по умолчанию: от большего количества продаж к меньшему.
          </Typography>
          <UiTable
            columns={columns}
            rows={rows}
            pinnedRows={rows.length > 0 ? [totalRow] : []}
            rowKey={(row) => (row.isTotal ? '__total__' : row.article)}
            initialSort={{ key: 'salesCount', direction: 'desc' }}
            showHeaderFilters={false}
            emptyText='Нет строк с продажами в выбранном фильтре артикулов.'
          />
        </div>
      </details>
    </section>
  )
}
