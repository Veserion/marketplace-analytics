import classNames from 'classnames/bind'
import type { TypographyColor } from '@/shared/ui-kit/typography'
import { Typography } from '@/shared/ui-kit/typography'
import { InfoTooltip } from '@/shared/ui-kit/tooltip'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiMetricsList'

export type UiMetricsListRow = {
  id: string
  label: string
  formula?: string
  valueText: string
  percentText?: string | null
  valueClassName?: string
  labelColor?: TypographyColor
}

type UiMetricsListProps = {
  rows: UiMetricsListRow[]
  className?: string
  hideThirdColumn?: boolean
}

export function UiMetricsList({ rows, className, hideThirdColumn = false }: UiMetricsListProps) {
  const formulaIcon = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10 7.04163V10.375M17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5C14.1421 2.5 17.5 5.85786 17.5 10ZM9.9585 12.875H10.0418V12.9583H9.9585V12.875Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )

  return (
    <div className={cn(BLOCK_NAME, className, { [`${BLOCK_NAME}--two-columns`]: hideThirdColumn })}>
      {rows.map((row) => (
        <div key={row.id} className={cn(`${BLOCK_NAME}__row`)}>
          <div className={cn(`${BLOCK_NAME}__metric-title`)}>
            <Typography as="span" variant="body2" color={row.labelColor ?? 'accent'} semiBold>{row.label}</Typography>
            {row.formula && (
              <InfoTooltip
                ariaLabel={`Пояснение: ${row.formula}`}
                content={row.formula}
                icon={formulaIcon}
              />
            )}
          </div>
          <Typography as="span" variant="body1" semiBold className={cn(`${BLOCK_NAME}__metric-value`, row.valueClassName)}>
            {row.valueText}
          </Typography>
          {!hideThirdColumn && (
            <Typography as="span" variant="body2" color="muted" semiBold className={cn(`${BLOCK_NAME}__metric-percent`)}>
              {row.percentText || ''}
            </Typography>
          )}
        </div>
      ))}
    </div>
  )
}
