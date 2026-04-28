import type { ReactNode } from 'react'
import classNames from 'classnames/bind'
import Tooltip from 'antd/es/tooltip'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'InfoTooltip'

type InfoTooltipProps = {
  content: ReactNode
  ariaLabel: string
  icon?: ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'sm' | 'md'
}

export function InfoTooltip({
  content,
  ariaLabel,
  icon,
  placement = 'top',
  size = 'md',
}: InfoTooltipProps) {
  return (
    <Tooltip
      color="var(--color-bg-tooltip)"
      overlayClassName={cn(`${BLOCK_NAME}__portal`)}
      placement={placement}
      title={content}
    >
      <span
        className={cn(BLOCK_NAME, `${BLOCK_NAME}--${size}`)}
        aria-label={ariaLabel}
        tabIndex={0}
      >
        {icon ?? <span className={cn(`${BLOCK_NAME}__default-icon`)}>i</span>}
      </span>
    </Tooltip>
  )
}
