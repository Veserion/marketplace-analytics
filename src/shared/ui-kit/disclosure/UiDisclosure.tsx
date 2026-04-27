import { useState } from 'react'
import type { ReactNode } from 'react'
import classNames from 'classnames'
import styles from './UiDisclosure.module.scss'

const BLOCK_NAME = 'UiDisclosure'

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

  const toggle = (): void => {
    if (disabled) return
    const nextOpen = !open
    if (!isControlled) {
      setInternalOpen(nextOpen)
    }
    onToggle?.(nextOpen)
  }

  return (
    <div className={classNames(styles[BLOCK_NAME], className, { [styles[`${BLOCK_NAME}--open`]]: open })}>
      <button
        type="button"
        className={classNames(styles[`${BLOCK_NAME}__trigger`], triggerClassName)}
        onClick={toggle}
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={classNames(styles[`${BLOCK_NAME}__title`], titleClassName)}>{title}</span>
        <span className={styles[`${BLOCK_NAME}__right`]}>
          {meta && <span className={styles[`${BLOCK_NAME}__meta`]}>{meta}</span>}
          <svg
            className={classNames(styles[`${BLOCK_NAME}__chevron`], chevronClassName)}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M15.8327 7L9.99935 12.8333L4.16602 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      <div
        className={classNames(styles[`${BLOCK_NAME}__content`], { [styles[`${BLOCK_NAME}__content--visible`]]: open }, contentClassName)}
        aria-hidden={!open}
      >
        <div className={classNames(styles[`${BLOCK_NAME}__content-inner`], contentInnerClassName)}>{children}</div>
      </div>
    </div>
  )
}
