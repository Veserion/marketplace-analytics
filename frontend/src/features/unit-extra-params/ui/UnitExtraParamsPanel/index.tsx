import classNames from 'classnames/bind'
import { useCallback, useEffect, useRef, useState } from 'react'
import Checkbox from 'antd/es/checkbox'
import Input from 'antd/es/input'
import InputNumber from 'antd/es/input-number'
import Radio from 'antd/es/radio'
import { UiAccordion } from '@/shared/ui-kit/accordion'
import { Typography } from '@/shared/ui-kit/typography'
import { useDebouncedCallback } from '@/shared/hooks/useDebounceCallback.ts'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UnitExtraParamsPanel'

type UnitExtraParamsPanelProps = {
  isOpen: boolean
  isAccrualMode?: boolean
  unitArticlePattern?: string
  accrualArticlePattern?: string
  unitArticlePatternExclude?: boolean
  accrualArticlePatternExclude?: boolean
  cogsMatchingMode?: 'full' | 'digits'
  priceMin?: number | null
  priceMax?: number | null
  vatRatePercent: number
  taxRatePercent: number
  onToggleOpen: () => void
  onUnitArticlePatternChange?: (pattern: string) => void
  onAccrualArticlePatternChange?: (pattern: string) => void
  onUnitArticlePatternExcludeChange?: (exclude: boolean) => void
  onAccrualArticlePatternExcludeChange?: (exclude: boolean) => void
  onCogsMatchingModeChange?: (mode: 'full' | 'digits') => void
  onPriceMinChange?: (value: number | null) => void
  onPriceMaxChange?: (value: number | null) => void
  onVatRateChange: (value: number) => void
  onTaxRateChange: (value: number) => void
}

export function UnitExtraParamsPanel({
  isOpen,
  isAccrualMode = false,
  unitArticlePattern = '*',
  accrualArticlePattern = '*',
  unitArticlePatternExclude = false,
  accrualArticlePatternExclude = false,
  cogsMatchingMode = 'full',
  priceMin = null,
  priceMax = null,
  vatRatePercent,
  taxRatePercent,
  onToggleOpen,
  onUnitArticlePatternChange,
  onAccrualArticlePatternChange,
  onUnitArticlePatternExcludeChange,
  onAccrualArticlePatternExcludeChange,
  onCogsMatchingModeChange,
  onPriceMinChange,
  onPriceMaxChange,
  onVatRateChange,
  onTaxRateChange,
}: UnitExtraParamsPanelProps) {
  const activePattern = isAccrualMode ? accrualArticlePattern : unitArticlePattern
  const onPatternChange = isAccrualMode ? onAccrualArticlePatternChange : onUnitArticlePatternChange
  const activePatternExclude = isAccrualMode ? accrualArticlePatternExclude : unitArticlePatternExclude
  const onPatternExcludeChange = isAccrualMode
    ? onAccrualArticlePatternExcludeChange
    : onUnitArticlePatternExcludeChange
  const [localPattern, setLocalPattern] = useDebouncedCallback(activePattern, onPatternChange)
  const [localPriceMin, setLocalPriceMin] = useDebouncedCallback(priceMin, onPriceMinChange)
  const [localPriceMax, setLocalPriceMax] = useDebouncedCallback(priceMax, onPriceMaxChange)
  const patternHint = isAccrualMode
    ? 'Фильтр применяется к отчету по начислениям. Поддерживаются `*` и `?`.\nПримеры: `st*` — все артикулы, начинающиеся с `st`; `??123` — любые 2 символа перед `123`.'
    : 'Фильтр применяется к юнит-экономике. Поддерживаются `*` и `?`.\nПримеры: `st*` — все артикулы, начинающиеся с `st`; `??123` — любые 2 символа перед `123`.'
  const titleSummaryParts = [
    `НДС ${vatRatePercent}%`,
    `Налог ${taxRatePercent}%`,
  ]

  if (onPatternChange) {
    titleSummaryParts.push(`Паттерн ${activePattern || '*'}`)
  }

  if (priceMin != null || priceMax != null) {
    const priceParts: string[] = []
    if (priceMin != null) priceParts.push(`от ${priceMin}`)
    if (priceMax != null) priceParts.push(`до ${priceMax}`)
    titleSummaryParts.push(`Цена ${priceParts.join(' ')}`)
  }

  return (
    <UiAccordion
      title={(
        <div className={cn(`${BLOCK_NAME}__title-wrap`)}>
          <Typography as="span" variant="h2" color="accent" bold>Дополнительные параметры</Typography>
          <Typography as="span" variant="body3" color="muted">
            {titleSummaryParts.join(' · ')}
          </Typography>
        </div>
      )}
      isOpen={isOpen}
      onToggle={() => onToggleOpen()}
      contentInnerClassName={cn(`${BLOCK_NAME}__content`)}
    >
      <section className={cn(`${BLOCK_NAME}__section`)}>
        <Typography as="h3" variant="h5" color="accent" className={cn(`${BLOCK_NAME}__section-title`)}>
          Налоги
        </Typography>
        <div className={cn(`${BLOCK_NAME}__grid`)}>
          <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="vatRateInput">
            <Typography as="span" variant="body2" color="accent" semiBold>НДС, %</Typography>
            <InputNumber<number>
              className={cn(`${BLOCK_NAME}__number-input`)}
              id="vatRateInput"
              min={0}
              step={1}
              controls
              value={vatRatePercent}
              onChange={(value) => onVatRateChange(typeof value === 'number' ? value : 0)}
            />
          </label>
          <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="taxRateInput">
            <Typography as="span" variant="body2" color="accent" semiBold>Налог, %</Typography>
            <InputNumber<number>
              className={cn(`${BLOCK_NAME}__number-input`)}
              id="taxRateInput"
              min={0}
              step={1}
              controls
              value={taxRatePercent}
              onChange={(value) => onTaxRateChange(typeof value === 'number' ? value : 0)}
            />
          </label>
        </div>
      </section>

      {onPatternChange && (
        <section className={cn(`${BLOCK_NAME}__section`)}>
          <Typography as="h3" variant="h5" color="accent" className={cn(`${BLOCK_NAME}__section-title`)}>
            Фильтрация
          </Typography>
          <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="articlePatternInput">
            <Typography as="span" variant="body2" color="accent" semiBold>Паттерн артикула</Typography>
            <Input
              id="articlePatternInput"
              value={localPattern}
              onChange={(event) => setLocalPattern(event.target.value)}
              placeholder="Например: st*"
            />
            <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__hint`)}>
              {patternHint}
            </Typography>
            {onPatternExcludeChange && (
              <Checkbox
                className={cn(`${BLOCK_NAME}__checkbox`)}
                checked={activePatternExclude}
                onChange={(event) => onPatternExcludeChange(event.target.checked)}
              >
                <Typography as="span" variant="body3" color="accent" semiBold>
                  Исключать совпадения по паттерну
                </Typography>
              </Checkbox>
            )}
          </label>
          {(onPriceMinChange || onPriceMaxChange) && (
            <div className={cn(`${BLOCK_NAME}__grid`)}>
              <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="priceMinInput">
                <Typography as="span" variant="body2" color="accent" semiBold>Цена от</Typography>
                <InputNumber<number>
                  className={cn(`${BLOCK_NAME}__number-input`)}
                  id="priceMinInput"
                  min={0}
                  step={100}
                  placeholder="0"
                  value={localPriceMin ?? undefined}
                  onChange={(value) => setLocalPriceMin(typeof value === 'number' ? value : null)}
                />
              </label>
              <label className={cn(`${BLOCK_NAME}__field`)} htmlFor="priceMaxInput">
                <Typography as="span" variant="body2" color="accent" semiBold>Цена до</Typography>
                <InputNumber<number>
                  className={cn(`${BLOCK_NAME}__number-input`)}
                  id="priceMaxInput"
                  min={0}
                  step={100}
                  placeholder="∞"
                  value={localPriceMax ?? undefined}
                  onChange={(value) => setLocalPriceMax(typeof value === 'number' ? value : null)}
                />
              </label>
            </div>
          )}
        </section>
      )}

      {onCogsMatchingModeChange && (
        <section className={cn(`${BLOCK_NAME}__section`)}>
          <Typography as="h3" variant="h5" color="accent" className={cn(`${BLOCK_NAME}__section-title`)}>
            Сопоставление
          </Typography>
          <div className={cn(`${BLOCK_NAME}__radio-group`)}>
            <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__hint`)}>
              Выберите режим сопоставления себестоимости с артикулами из отчета.
            </Typography>
            <Radio.Group
              className={cn(`${BLOCK_NAME}__radio-options`)}
              name="cogsMatchingMode"
              value={cogsMatchingMode}
              onChange={(event) => onCogsMatchingModeChange(event.target.value as 'full' | 'digits')}
            >
              <Radio className={cn(`${BLOCK_NAME}__radio-option`)} value="full">
                <Typography as="span" variant="body2" color="accent">Точное</Typography>
              </Radio>
              <Radio className={cn(`${BLOCK_NAME}__radio-option`)} value="digits">
                <Typography as="span" variant="body2" color="accent">По цифрам</Typography>
              </Radio>
            </Radio.Group>
          </div>
        </section>
      )}
    </UiAccordion>
  )
}
