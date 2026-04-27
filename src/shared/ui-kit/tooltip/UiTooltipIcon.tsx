import { useState } from 'react'
import type { FocusEvent, MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import classNames from 'classnames/bind'
import styles from './UiTooltipIcon.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiTooltipIcon'

type TooltipState = {
  visible: boolean
  x: number
  y: number
}

type UiTooltipIconProps = {
  content: ReactNode
  ariaLabel: string
  icon?: ReactNode
}

export function UiTooltipIcon({ content, ariaLabel, icon }: UiTooltipIconProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0 })

  const showTooltip = (
    event: MouseEvent<HTMLSpanElement> | FocusEvent<HTMLSpanElement>,
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    })
  }

  const hideTooltip = (): void => {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }

  return (
    <>
      <span
        className={cn(BLOCK_NAME)}
        aria-label={ariaLabel}
        tabIndex={0}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {icon ?? <span className={cn(`${BLOCK_NAME}__default-icon`)}>i</span>}
      </span>
      {tooltip.visible && typeof document !== 'undefined' && createPortal(
        <div
          className={cn(`${BLOCK_NAME}__portal`)}
          role="tooltip"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  )
}
