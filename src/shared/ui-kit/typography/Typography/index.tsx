import React from 'react'
import classNames from 'classnames/bind'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'Typography'

export type TypographyVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'body1'
  | 'body2'
  | 'body3'
  | 'caption'

export type TypographyAlign = 'left' | 'center' | 'right'
export type TypographyColor = 'primary' | 'muted' | 'light' | 'accent' | 'positive' | 'negative' | 'warning'

export type TypographyProps = {
  variant?: TypographyVariant
  align?: TypographyAlign
  color?: TypographyColor
  as?: React.ElementType
  children: React.ReactNode
  className?: string
  semiBold?: boolean
  bold?: boolean
}

export function Typography({
  variant = 'body1',
  align = 'left',
  color = 'primary',
  as,
  children,
  className,
  semiBold = false,
  bold = false,
}: TypographyProps) {
  const elementType: React.ElementType = as
    ?? (variant.startsWith('h') ? (variant.slice(0, 2) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5') : 'p')

  return React.createElement(elementType, {
    className: cn(
      BLOCK_NAME,
      `${BLOCK_NAME}--${variant}`,
      `${BLOCK_NAME}--align-${align}`,
      `${BLOCK_NAME}--color-${color}`,
      {
        [`${BLOCK_NAME}--semi-bold`]: semiBold,
        [`${BLOCK_NAME}--bold`]: bold,
      },
      className,
    ),
    children,
  })
}
