import type { ReactNode } from 'react'
import { InfoTooltip } from '@/shared/ui-kit/tooltip/InfoTooltip'

type UiTooltipIconProps = {
  content: ReactNode
  ariaLabel: string
  icon?: ReactNode
}

export function UiTooltipIcon({ content, ariaLabel, icon }: UiTooltipIconProps) {
  return (
    <InfoTooltip
      content={content}
      ariaLabel={ariaLabel}
      icon={icon}
    />
  )
}
