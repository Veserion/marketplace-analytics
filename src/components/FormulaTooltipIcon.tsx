import { createPortal } from 'react-dom'
import { useState } from 'react'

type TooltipState = {
  visible: boolean
  x: number
  y: number
}

type FormulaTooltipIconProps = {
  formula: string
}

export function FormulaTooltipIcon({ formula }: FormulaTooltipIconProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0 })

  const showTooltip = (
    event: React.MouseEvent<HTMLSpanElement> | React.FocusEvent<HTMLSpanElement>,
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
        className="metric-tooltip"
        aria-label={`Формула: ${formula}`}
        tabIndex={0}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M10 7.04163V10.375M17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5C14.1421 2.5 17.5 5.85786 17.5 10ZM9.9585 12.875H10.0418V12.9583H9.9585V12.875Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      {tooltip.visible && typeof document !== 'undefined' && createPortal(
        <div
          className="formula-tooltip-portal"
          role="tooltip"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
        >
          {formula}
        </div>,
        document.body,
      )}
    </>
  )
}
