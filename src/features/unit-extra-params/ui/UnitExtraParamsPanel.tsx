import classNames from 'classnames/bind'
import { Typography, UiPanel, UiSectionToggle } from '@/shared/ui-kit'
import styles from './UnitExtraParamsPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UnitExtraParamsPanel'

type UnitExtraParamsPanelProps = {
  isOpen: boolean
  vatRatePercent: number
  taxRatePercent: number
  onToggleOpen: () => void
  onVatRateChange: (value: number) => void
  onTaxRateChange: (value: number) => void
}

export function UnitExtraParamsPanel({
  isOpen,
  vatRatePercent,
  taxRatePercent,
  onToggleOpen,
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
        </div>
      )}
    </UiPanel>
  )
}
