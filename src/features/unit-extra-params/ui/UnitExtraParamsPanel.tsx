import classNames from 'classnames/bind'
import { Typography, UiPanel, UiSectionToggle } from '@/shared/ui-kit'
import styles from './UnitExtraParamsPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UnitExtraParamsPanel'

type UnitExtraParamsPanelProps = {
  isOpen: boolean
  isAccrualMode?: boolean
  accrualArticlePattern?: string
  vatRatePercent: number
  taxRatePercent: number
  onToggleOpen: () => void
  onAccrualArticlePatternChange?: (pattern: string) => void
  onVatRateChange: (value: number) => void
  onTaxRateChange: (value: number) => void
}

export function UnitExtraParamsPanel({
  isOpen,
  isAccrualMode = false,
  accrualArticlePattern = '*',
  vatRatePercent,
  taxRatePercent,
  onToggleOpen,
  onAccrualArticlePatternChange,
  onVatRateChange,
  onTaxRateChange,
}: UnitExtraParamsPanelProps) {
  return (
    <UiPanel className={cn(BLOCK_NAME)}>
      <UiSectionToggle title="Дополнительные параметры" isOpen={isOpen} onToggle={onToggleOpen} />

      {isOpen && (
        <div className={cn(`${BLOCK_NAME}__content`)}>
          <div className={cn(`${BLOCK_NAME}__grid`)}>
            <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="vatRateInput">
              <Typography as="span" variant="body2" color="accent" semiBold>НДС, %</Typography>
              <input
                id="vatRateInput"
                type="number"
                min="0"
                step="0.1"
                value={vatRatePercent}
                onChange={(event) => onVatRateChange(Number(event.target.value))}
              />
            </label>
            <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="taxRateInput">
              <Typography as="span" variant="body2" color="accent" semiBold>Налог, %</Typography>
              <input
                id="taxRateInput"
                type="number"
                min="0"
                step="0.1"
                value={taxRatePercent}
                onChange={(event) => onTaxRateChange(Number(event.target.value))}
              />
            </label>
          </div>
          {isAccrualMode && onAccrualArticlePatternChange && (
            <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="accrualArticlePatternInput">
              <Typography as="span" variant="body2" color="accent" semiBold>Паттерн артикула</Typography>
              <input
                id="accrualArticlePatternInput"
                type="text"
                value={accrualArticlePattern}
                onChange={(event) => onAccrualArticlePatternChange(event.target.value)}
                placeholder="Например: st*"
              />
              <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__hint`)}>
                Фильтр применяется к отчету по начислениям. Поддерживаются `*` и `?`.
              </Typography>
            </label>
          )}
        </div>
      )}
    </UiPanel>
  )
}
