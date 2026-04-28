import type { ReactNode } from 'react'
import classNames from 'classnames/bind'
import Tooltip from 'antd/es/tooltip'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiTooltipIcon'

type UiTooltipIconProps = {
  content: ReactNode
  ariaLabel: string
  icon?: ReactNode
}

export function UiTooltipIcon({ content, ariaLabel, icon }: UiTooltipIconProps) {
  return (
    <Tooltip
      color="var(--color-bg-tooltip)"
      overlayClassName={cn(`${BLOCK_NAME}__portal`)}
      placement="top"
      title={content}
    >
      <span
        className={cn(BLOCK_NAME)}
        aria-label={ariaLabel}
        tabIndex={0}
      >
        {icon ?? <span className={cn(`${BLOCK_NAME}__default-icon`)}>i</span>}
      </span>
    </Tooltip>
  )
}
