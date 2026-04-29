import classNames from 'classnames/bind'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './UiSectionToggle.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiSectionToggle'

type UiSectionToggleProps = {
  title: string
  isOpen: boolean
  onToggle: () => void
}

export function UiSectionToggle({ title, isOpen, onToggle }: UiSectionToggleProps) {
  return (
    <button
      className={cn(BLOCK_NAME)}
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <Typography as="span" variant="h2" color="accent" bold>{title}</Typography>
      <span className={cn(`${BLOCK_NAME}__icon`, { [`${BLOCK_NAME}__icon--open`]: isOpen })} aria-hidden="true">▾</span>
    </button>
  )
}
