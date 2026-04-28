import classNames from 'classnames/bind'
import { InfoTooltip } from '@/shared/ui-kit/tooltip'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'FormulaTooltipIcon'

type FormulaTooltipIconProps = {
  formula: string
}

export function FormulaTooltipIcon({ formula }: FormulaTooltipIconProps) {
  return (
    <InfoTooltip
      ariaLabel={`Формула: ${formula}`}
      content={formula}
      icon={(
        <span className={cn(BLOCK_NAME)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M10 7.04163V10.375M17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5C14.1421 2.5 17.5 5.85786 17.5 10ZM9.9585 12.875H10.0418V12.9583H9.9585V12.875Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      )}
    />
  )
}
