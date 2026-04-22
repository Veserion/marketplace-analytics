import { useMemo, useState } from 'react'
import type { ProductMarginItem } from '../types/reports'

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
    <section className="product-margin-panel">
      <details className="product-margin-details">
        <summary className="product-margin-summary">
          <h4 className="product-margin-title">Потоварная маржинальность</h4>
          <svg className="product-margin-expand-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M15.8327 7L9.99935 12.8333L4.16602 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </summary>

        <div className="product-margin-content">
          <div className="product-margin-head">
            <label className="product-margin-sort" htmlFor="marginSortSelect">
              <span>Сортировка</span>
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

          <div className="product-margin-list">
            {sortedItems.length === 0 && <p className="product-margin-empty">Нет данных в колонке "Доля от продаж"</p>}
            {sortedItems.map((item) => (
              <div key={item.article} className="product-margin-row">
                <code>{item.article}</code>
                <span>
                  {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(item.marginSharePercent)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  )
}
