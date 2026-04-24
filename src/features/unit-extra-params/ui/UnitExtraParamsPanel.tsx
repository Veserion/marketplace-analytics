import classNames from 'classnames/bind'
import { Typography, UiDisclosure, UiPanel } from '@/shared/ui-kit'
import styles from './UnitExtraParamsPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UnitExtraParamsPanel'

type UnitExtraParamsPanelProps = {
  isOpen: boolean
  isAccrualMode?: boolean
  unitArticlePattern?: string
  accrualArticlePattern?: string
  cogsMatchingMode?: 'full' | 'digits'
  vatRatePercent: number
  taxRatePercent: number
  onToggleOpen: () => void
  onUnitArticlePatternChange?: (pattern: string) => void
  onAccrualArticlePatternChange?: (pattern: string) => void
  onCogsMatchingModeChange?: (mode: 'full' | 'digits') => void
  onVatRateChange: (value: number) => void
  onTaxRateChange: (value: number) => void
}

export function UnitExtraParamsPanel({
  isOpen,
  isAccrualMode = false,
  unitArticlePattern = '*',
  accrualArticlePattern = '*',
  cogsMatchingMode = 'full',
  vatRatePercent,
  taxRatePercent,
  onToggleOpen,
  onUnitArticlePatternChange,
  onAccrualArticlePatternChange,
  onCogsMatchingModeChange,
  onVatRateChange,
  onTaxRateChange,
}: UnitExtraParamsPanelProps) {
  const activePattern = isAccrualMode ? accrualArticlePattern : unitArticlePattern
  const onPatternChange = isAccrualMode ? onAccrualArticlePatternChange : onUnitArticlePatternChange
  const patternHint = isAccrualMode
    ? 'Фильтр применяется к отчету по начислениям. Поддерживаются `*` и `?`.'
    : 'Фильтр применяется к юнит-экономике. Поддерживаются `*` и `?`.'

  return (
    <UiPanel className={cn(BLOCK_NAME)}>
      <UiDisclosure
        title={<Typography as="span" variant="h2" color="accent" bold>Дополнительные параметры</Typography>}
        isOpen={isOpen}
        onToggle={() => onToggleOpen()}
        triggerClassName={cn(`${BLOCK_NAME}__trigger`)}
        chevronClassName={cn(`${BLOCK_NAME}__chevron`)}
        contentInnerClassName={cn(`${BLOCK_NAME}__content`)}
      >
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
          {onPatternChange && (
            <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="articlePatternInput">
              <Typography as="span" variant="body2" color="accent" semiBold>Паттерн артикула</Typography>
              <input
                id="articlePatternInput"
                type="text"
                value={activePattern}
                onChange={(event) => onPatternChange(event.target.value)}
                placeholder="Например: st*"
              />
              <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__hint`)}>
                {patternHint}
              </Typography>
            </label>
          )}
          {onCogsMatchingModeChange && (
            <div className={cn(`${BLOCK_NAME}__radio-group`)}>
              <Typography variant="body2" color="accent" semiBold className={cn(`${BLOCK_NAME}__radio-title`)}>
                Сопоставление себестоимости
              </Typography>
              <label className={cn(`${BLOCK_NAME}__radio-option`)}>
                <input
                  type="radio"
                  name="cogsMatchingMode"
                  value="full"
                  checked={cogsMatchingMode === 'full'}
                  onChange={() => onCogsMatchingModeChange('full')}
                />
                <Typography as="span" variant="body2" color="accent">Точное</Typography>
              </label>
              <label className={cn(`${BLOCK_NAME}__radio-option`)}>
                <input
                  type="radio"
                  name="cogsMatchingMode"
                  value="digits"
                  checked={cogsMatchingMode === 'digits'}
                  onChange={() => onCogsMatchingModeChange('digits')}
                />
                <Typography as="span" variant="body2" color="accent">По цифрам</Typography>
              </label>
            </div>
          )}
      </UiDisclosure>
    </UiPanel>
  )
}
