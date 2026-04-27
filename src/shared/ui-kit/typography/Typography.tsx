import React from 'react'
import classNames from 'classnames/bind'
import AntTypography from 'antd/es/typography'
import styles from './Typography.module.scss'

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
  const classNameValue = cn(
    BLOCK_NAME,
    `${BLOCK_NAME}--${variant}`,
    `${BLOCK_NAME}--align-${align}`,
    `${BLOCK_NAME}--color-${color}`,
    {
      [`${BLOCK_NAME}--semi-bold`]: semiBold,
      [`${BLOCK_NAME}--bold`]: bold,
    },
    className,
  )

  if (as) {
    return React.createElement(as, {
      className: classNameValue,
      children,
    })
  }

  if (variant.startsWith('h')) {
    return (
      <AntTypography.Title level={Number(variant.slice(1)) as 1 | 2 | 3 | 4 | 5} className={classNameValue}>
        {children}
      </AntTypography.Title>
    )
  }

  return <AntTypography.Paragraph className={classNameValue}>{children}</AntTypography.Paragraph>
}
