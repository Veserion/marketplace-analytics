import { useState } from 'react'
import type { AvailabilityGroups } from '../types/reports'

type AvailabilityStockPanelProps = {
  groups: AvailabilityGroups
}

type GroupConfig = {
  key: keyof AvailabilityGroups
  title: string
  className: string
}

const GROUPS: GroupConfig[] = [
  { key: 'urgent', title: 'Срочно поставить', className: 'availability-group-red' },
  { key: 'maintain', title: 'Поддерживайте остаток', className: 'availability-group-yellow' },
  { key: 'enough', title: 'Пока хватает', className: 'availability-group-green' },
]

export function AvailabilityStockPanel({ groups }: AvailabilityStockPanelProps) {
  const [copiedArticle, setCopiedArticle] = useState<string | null>(null)
  const [copiedGroup, setCopiedGroup] = useState<keyof AvailabilityGroups | null>(null)

  const copyArticle = async (article: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(article)
      setCopiedArticle(article)
      window.setTimeout(() => setCopiedArticle((prev) => (prev === article ? null : prev)), 1200)
    } catch {
      setCopiedArticle(null)
    }
  }

  const copyGroupArticles = async (groupKey: keyof AvailabilityGroups, items: string[]): Promise<void> => {
    if (items.length === 0) return
    try {
      await navigator.clipboard.writeText(items.join(', '))
      setCopiedGroup(groupKey)
      window.setTimeout(() => setCopiedGroup((prev) => (prev === groupKey ? null : prev)), 1200)
    } catch {
      setCopiedGroup(null)
    }
  }

  return (
    <section className="availability-stock-panel">
      <h4 className="availability-title">Доступность товаров</h4>

      <div className="availability-groups">
        {GROUPS.map((group) => {
          const items = groups[group.key]
          return (
            <div key={group.key} className="availability-group-row">
              <details className={`availability-group ${group.className}`}>
                <summary className="availability-summary">
                  <span>{group.title}</span>
                  <span className="availability-summary-right">
                    <span>{items.length}</span>
                    <svg className="availability-expand-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M15.8327 7L9.99935 12.8333L4.16602 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </summary>

                <div className="availability-list">
                  {items.length === 0 && <p className="availability-empty">Нет артикулов</p>}
                  {items.map((article) => (
                    <div key={article} className="availability-item">
                      <code>{article}</code>
                      <button
                        type="button"
                        className="copy-article-btn"
                        onClick={() => void copyArticle(article)}
                        aria-label={`Копировать артикул ${article}`}
                        title="Копировать артикул"
                      >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M12.5 12.5H16.6667C17.1269 12.5 17.5 12.1269 17.5 11.6667V3.33333C17.5 2.8731 17.1269 2.5 16.6667 2.5H8.33333C7.8731 2.5 7.5 2.8731 7.5 3.33333V7.5M11.6667 17.5L3.33333 17.5C2.8731 17.5 2.5 17.1269 2.5 16.6667L2.5 8.33333C2.5 7.8731 2.8731 7.5 3.33333 7.5H11.6667C12.1269 7.5 12.5 7.8731 12.5 8.33333L12.5 16.6667C12.5 17.1269 12.1269 17.5 11.6667 17.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {copiedArticle === article && <span className="copy-status">Скопировано</span>}
                    </div>
                  ))}
                </div>
              </details>

              <button
                type="button"
                className="copy-group-icon-btn"
                onClick={() => void copyGroupArticles(group.key, items)}
                aria-label={`Скопировать артикулы группы ${group.title}`}
                title="Скопировать артикулы"
                disabled={items.length === 0}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12.5 12.5H16.6667C17.1269 12.5 17.5 12.1269 17.5 11.6667V3.33333C17.5 2.8731 17.1269 2.5 16.6667 2.5H8.33333C7.8731 2.5 7.5 2.8731 7.5 3.33333V7.5M11.6667 17.5L3.33333 17.5C2.8731 17.5 2.5 17.1269 2.5 16.6667L2.5 8.33333C2.5 7.8731 2.8731 7.5 3.33333 7.5H11.6667C12.1269 7.5 12.5 7.8731 12.5 8.33333L12.5 16.6667C12.5 17.1269 12.1269 17.5 11.6667 17.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {copiedGroup === group.key && <span className="copy-group-status">Скопировано</span>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
