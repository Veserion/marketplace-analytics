import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import classNames from 'classnames/bind'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiFlex'

type UiFlexDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse'
type UiFlexAlign = 'start' | 'end' | 'center' | 'stretch' | 'baseline'
type UiFlexJustify = 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly'
type UiFlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse'

const ALIGN_MAP: Record<UiFlexAlign, string> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  stretch: 'stretch',
  baseline: 'baseline',
}

const JUSTIFY_MAP: Record<UiFlexJustify, string> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
}

type UiFlexProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode
  direction?: UiFlexDirection
  align?: UiFlexAlign
  justify?: UiFlexJustify
  wrap?: UiFlexWrap
  gap?: number | string
  rowGap?: number | string
  columnGap?: number | string
  grow?: boolean
  shrink?: boolean
  basis?: string | number
}

function normalizeSizeValue(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value
}

function resolveGap(gap: UiFlexProps['gap']): { styleValue?: string } {
  if (gap === undefined) return {}
  return { styleValue: normalizeSizeValue(gap) }
}

export function UiFlex({
  children,
  className,
  style,
  direction = 'row',
  align,
  justify,
  wrap = 'nowrap',
  gap,
  rowGap,
  columnGap,
  grow = false,
  shrink = false,
  basis,
  ...props
}: UiFlexProps) {
  const { styleValue: gapStyleValue } = resolveGap(gap)
  const flexStyle: CSSProperties = {
    ...style,
    display: 'flex',
    flexDirection: direction,
    ...(align && { alignItems: ALIGN_MAP[align] }),
    ...(justify && { justifyContent: JUSTIFY_MAP[justify] }),
    flexWrap: wrap,
    ...(gapStyleValue && { gap: gapStyleValue }),
    ...(rowGap !== undefined && { rowGap: normalizeSizeValue(rowGap) }),
    ...(columnGap !== undefined && { columnGap: normalizeSizeValue(columnGap) }),
    ...(grow && { flex: 1 }),
    ...(shrink && { flexShrink: 1 }),
    ...(basis !== undefined && { flexBasis: normalizeSizeValue(basis) }),
  }

  return (
    <div className={cn(BLOCK_NAME, className)} style={flexStyle} {...props}>
      {children}
    </div>
  )
}
