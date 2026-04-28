import classNames from 'classnames/bind'
import type { TypographyColor } from '@/shared/ui-kit/typography'
import { Typography } from '@/shared/ui-kit/typography'
import { FormulaTooltipIcon } from '@/shared/ui/formula-tooltip-icon'
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
  return (
    <div className={cn(BLOCK_NAME, className, { [`${BLOCK_NAME}--two-columns`]: hideThirdColumn })}>
      {rows.map((row) => (
        <div key={row.id} className={cn(`${BLOCK_NAME}__row`)}>
          <div className={cn(`${BLOCK_NAME}__metric-title`)}>
            <Typography as="span" variant="body2" color={row.labelColor ?? 'accent'} semiBold>{row.label}</Typography>
            {row.formula && <FormulaTooltipIcon formula={row.formula} />}
          </div>
          <Typography as="span" variant="body1" semiBold className={row.valueClassName}>
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
