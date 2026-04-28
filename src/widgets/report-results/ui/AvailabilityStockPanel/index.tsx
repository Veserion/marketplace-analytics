import classNames from 'classnames/bind'
import { CopyOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'
import { useState } from 'react'
import type { AvailabilityGroups } from '@/entities/ozon-report/model/types'
import { UiDisclosure } from '@/shared/ui-kit/disclosure'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AvailabilityStockPanel'

type AvailabilityStockPanelProps = {
  groups: AvailabilityGroups
}

type GroupConfig = {
  key: keyof AvailabilityGroups
  title: string
  modifier: 'red' | 'yellow' | 'green'
}

const GROUPS: GroupConfig[] = [
  { key: 'urgent', title: 'Срочно поставить', modifier: 'red' },
  { key: 'maintain', title: 'Поддерживайте остаток', modifier: 'yellow' },
  { key: 'enough', title: 'Пока хватает', modifier: 'green' },
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
    <section className={cn(BLOCK_NAME)}>
      <Typography variant="h5" color="accent" className={cn(`${BLOCK_NAME}__title`)}>Доступность товаров</Typography>

      <div className={cn(`${BLOCK_NAME}__groups`)}>
        {GROUPS.map((group) => {
          const items = groups[group.key]
          return (
            <div key={group.key} className={cn(`${BLOCK_NAME}__group-row`)}>
              <UiDisclosure
                className={cn(`${BLOCK_NAME}__group`, `${BLOCK_NAME}__group--${group.modifier}`)}
                contentInnerClassName={cn(`${BLOCK_NAME}__list`)}
                title={<Typography as="span" variant="body2" semiBold>{group.title}</Typography>}
                meta={<Typography as="span" variant="body2" semiBold>{items.length}</Typography>}
              >
                  {items.length === 0 && <Typography variant="body3" color="muted">Нет артикулов</Typography>}
                  {items.map((article) => (
                    <div key={article} className={cn(`${BLOCK_NAME}__item`)}>
                      <code>{article}</code>
                      <Button
                        className={cn(`${BLOCK_NAME}__copy-article-btn`)}
                        icon={<CopyOutlined />}
                        onClick={() => void copyArticle(article)}
                        aria-label={`Копировать артикул ${article}`}
                        title="Копировать артикул"
                      />
                      {copiedArticle === article && <Typography as="span" variant="caption" color="accent" semiBold>Скопировано</Typography>}
                    </div>
                  ))}
              </UiDisclosure>

              <Button
                className={cn(`${BLOCK_NAME}__copy-group-btn`)}
                icon={<CopyOutlined />}
                onClick={() => void copyGroupArticles(group.key, items)}
                aria-label={`Скопировать артикулы группы ${group.title}`}
                title="Скопировать артикулы"
                disabled={items.length === 0}
              />
              {copiedGroup === group.key && <Typography as="span" variant="caption" color="accent" semiBold>Скопировано</Typography>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
