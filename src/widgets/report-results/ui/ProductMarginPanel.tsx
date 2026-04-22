import classNames from 'classnames/bind'
import { useMemo, useState } from 'react'
import type { ProductMarginItem } from '@/entities/ozon-report/model/types'
import { Typography } from '@/shared/ui-kit'
import styles from './ProductMarginPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProductMarginPanel'

type ProductMarginSort = 'articleAsc' | 'marginDesc' | 'marginAsc'

type ProductMarginPanelProps = {
  items: ProductMarginItem[]
}

export function ProductMarginPanel({ items }: ProductMarginPanelProps) {
  const [sortType, setSortType] = useState<ProductMarginSort>('articleAsc')

  const sortedItems = useMemo(() => {
    const copy = [...items]
    if (sortType === 'articleAsc') {
      return copy.sort((a, b) => a.article.localeCompare(b.article, 'ru'))
    }
    if (sortType === 'marginDesc') {
      return copy.sort((a, b) => b.marginSharePercent - a.marginSharePercent)
    }
    return copy.sort((a, b) => a.marginSharePercent - b.marginSharePercent)
  }, [items, sortType])

  return (
    <section className={cn(BLOCK_NAME)}>
      <details className={cn(`${BLOCK_NAME}__details`)}>
        <summary className={cn(`${BLOCK_NAME}__summary`)}>
          <Typography variant="h5" color="accent">Потоварная маржинальность</Typography>
          <svg className={cn(`${BLOCK_NAME}__expand-icon`)} width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M15.8327 7L9.99935 12.8333L4.16602 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </summary>

        <div className={cn(`${BLOCK_NAME}__content`)}>
          <div className={cn(`${BLOCK_NAME}__head`)}>
            <label className={cn(`${BLOCK_NAME}__sort`)} htmlFor="marginSortSelect">
              <Typography as="span" variant="body3" color="muted">Сортировка</Typography>
              <select
                id="marginSortSelect"
                value={sortType}
                onChange={(event) => setSortType(event.target.value as ProductMarginSort)}
              >
                <option value="articleAsc">Артикулы по алфавиту</option>
                <option value="marginDesc">Маржинальность по убыванию</option>
                <option value="marginAsc">Маржинальность по возрастанию</option>
              </select>
            </label>
          </div>

          <div className={cn(`${BLOCK_NAME}__list`)}>
            {sortedItems.length === 0 && <Typography variant="body3" color="muted">Нет данных в колонке "Доля от продаж"</Typography>}
            {sortedItems.map((item) => (
              <div key={item.article} className={cn(`${BLOCK_NAME}__row`)}>
                <code>{item.article}</code>
                <Typography as="span" variant="body3" color="accent" bold>
                  {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(item.marginSharePercent)}%
                </Typography>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  )
}
