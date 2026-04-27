import { useState } from 'react'
import type { ReactNode } from 'react'
import { DownOutlined } from '@ant-design/icons'
import Collapse from 'antd/es/collapse'
import classNames from 'classnames'
import styles from './UiDisclosure.module.scss'

const BLOCK_NAME = 'UiDisclosure'
const PANEL_KEY = 'content'

type UiDisclosureProps = {
  title: ReactNode
  children: ReactNode
  className?: string
  triggerClassName?: string
  titleClassName?: string
  contentClassName?: string
  contentInnerClassName?: string
  chevronClassName?: string
  meta?: ReactNode
  isOpen?: boolean
  defaultOpen?: boolean
  disabled?: boolean
  onToggle?: (nextOpen: boolean) => void
}

export function UiDisclosure({
  title,
  children,
  className,
  triggerClassName,
  titleClassName,
  contentClassName,
  contentInnerClassName,
  chevronClassName,
  meta,
  isOpen,
  defaultOpen = false,
  disabled = false,
  onToggle,
}: UiDisclosureProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = typeof isOpen === 'boolean'
  const open = isControlled ? Boolean(isOpen) : internalOpen

  const handleToggle = (keys: string[]): void => {
    if (disabled) return
    const nextOpen = keys.includes(PANEL_KEY)
    if (!isControlled) {
      setInternalOpen(nextOpen)
    }
    onToggle?.(nextOpen)
  }

  return (
    <Collapse
      ghost
      bordered={false}
      collapsible={disabled ? 'disabled' : undefined}
      activeKey={open ? [PANEL_KEY] : []}
      onChange={handleToggle}
      className={classNames(styles[BLOCK_NAME], className, { [styles[`${BLOCK_NAME}--open`]]: open })}
      expandIcon={({ isActive }) => (
        <DownOutlined
          className={classNames(
            styles[`${BLOCK_NAME}__chevron`],
            { [styles[`${BLOCK_NAME}__chevron--open`]]: Boolean(isActive) },
            chevronClassName,
          )}
        />
      )}
      expandIconPlacement="end"
      items={[
        {
          key: PANEL_KEY,
          label: <span className={classNames(styles[`${BLOCK_NAME}__title`], titleClassName)}>{title}</span>,
          extra: meta ? <span className={styles[`${BLOCK_NAME}__meta`]}>{meta}</span> : undefined,
          children: (
            <div className={classNames(styles[`${BLOCK_NAME}__content-inner`], contentInnerClassName)}>
              {children}
            </div>
          ),
          classNames: {
            body: classNames(styles[`${BLOCK_NAME}__content`], contentClassName),
            header: classNames(styles[`${BLOCK_NAME}__trigger`], triggerClassName),
          },
        },
      ]}
    />
  )
}
