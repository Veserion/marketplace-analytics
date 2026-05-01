import classNames from 'classnames/bind'
import DatePicker from 'antd/es/date-picker'
import Button from 'antd/es/button'
import Alert from 'antd/es/alert'
import {useState, useMemo} from 'react'
import type {Dayjs} from 'dayjs'
import dayjs from 'dayjs'
import {UiCard} from '@/shared/ui-kit/card'
import {UiFlex} from '@/shared/ui-kit/flex'
import {Typography} from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'PeriodSelectionPanel'

const {RangePicker} = DatePicker

type PeriodPreset = '7d' | '14d' | '30d' | 'currentMonth' | 'lastMonth' | 'custom'

const PRESET_CONFIG: {key: PeriodPreset; label: string}[] = [
  {key: '7d', label: '7 дней'},
  {key: '14d', label: '14 дней'},
  {key: '30d', label: '30 дней'},
  {key: 'currentMonth', label: 'Текущий месяц'},
  {key: 'lastMonth', label: 'Прошлый месяц'},
  {key: 'custom', label: 'Свой период'},
]

const MAX_PERIOD_DAYS = 31

function getPresetRange(preset: PeriodPreset): [Dayjs, Dayjs] | null {
  const today = dayjs()
  switch (preset) {
    case '7d':
      return [today.subtract(6, 'day'), today]
    case '14d':
      return [today.subtract(13, 'day'), today]
    case '30d':
      return [today.subtract(29, 'day'), today]
    case 'currentMonth':
      return [today.startOf('month'), today]
    case 'lastMonth': {
      const lastMonthStart = today.subtract(1, 'month').startOf('month')
      const lastMonthEnd = today.subtract(1, 'month').endOf('month')
      return [lastMonthStart, lastMonthEnd]
    }
    case 'custom':
      return null
  }
}

type PeriodSelectionPanelProps = {
  isFetching?: boolean
  hasFetchedReport?: boolean
  fetchedPeriodStart?: string | null
  fetchedPeriodEnd?: string | null
  fetchedRowCount?: number | null
  onFetchReport?: (dateFrom: string, dateTo: string) => void
  onReset?: () => void
}

export function PeriodSelectionPanel({
  isFetching = false,
  hasFetchedReport = false,
  fetchedPeriodStart,
  fetchedPeriodEnd,
  fetchedRowCount,
  onFetchReport,
  onReset,
}: PeriodSelectionPanelProps) {
  const [activePreset, setActivePreset] = useState<PeriodPreset | null>(null)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [validationError, setValidationError] = useState('')

  const hasDateRange = dateRange?.[0] != null && dateRange?.[1] != null

  const isFetchDisabled = useMemo(() => {
    if (isFetching) return true
    if (!hasDateRange) return true
    return false
  }, [isFetching, hasDateRange])

  function handlePresetClick(preset: PeriodPreset) {
    setValidationError('')
    setActivePreset(preset)
    if (preset === 'custom') {
      return
    }
    const range = getPresetRange(preset)
    if (range) {
      setDateRange(range)
    }
  }

  function handleRangeChange(
    values: [Dayjs | null, Dayjs | null] | null,
  ) {
    setValidationError('')
    if (activePreset !== 'custom') {
      setActivePreset('custom')
    }
    setDateRange(values)
  }

  function handleFetch() {
    if (!dateRange?.[0] || !dateRange?.[1]) return

    const from = dateRange[0]
    const to = dateRange[1]

    if (from.isAfter(to)) {
      setValidationError('Дата начала не может быть позже даты окончания.')
      return
    }

    const diffDays = to.diff(from, 'day') + 1
    if (diffDays > MAX_PERIOD_DAYS) {
      setValidationError('Выберите период не больше 31 дня.')
      return
    }

    onFetchReport?.(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'))
  }

  function handleReset() {
    setActivePreset(null)
    setDateRange(null)
    setValidationError('')
    onReset?.()
  }

  const fetchButtonText = isFetching ? 'Получаем отчёт...' : 'Получить отчёт WB'

  if (hasFetchedReport) {
    const startFormatted = fetchedPeriodStart
      ? dayjs(fetchedPeriodStart).format('DD.MM.YYYY')
      : '—'
    const endFormatted = fetchedPeriodEnd
      ? dayjs(fetchedPeriodEnd).format('DD.MM.YYYY')
      : '—'

    return (
      <UiCard className={cn(BLOCK_NAME)} padding="sm">
        <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
          Выберите период
        </Typography>
        <Alert
          type="success"
          showIcon
          message="Отчёт получен через API"
          className={cn(`${BLOCK_NAME}__success-alert`)}
        />
        <Typography variant="body3" color="muted">
          Период аналитики: {startFormatted} – {endFormatted}
        </Typography>
        {fetchedRowCount != null && (
          <Typography variant="body3" color="muted">
            Строк в отчёте: {fetchedRowCount}
          </Typography>
        )}
        <UiFlex align="center" gap={8} style={{marginTop: 8}}>
          <Button type="primary" loading={isFetching} onClick={handleFetch}>
            Обновить
          </Button>
          <Button onClick={handleReset}>
            Сбросить
          </Button>
        </UiFlex>
      </UiCard>
    )
  }

  return (
    <UiCard className={cn(BLOCK_NAME)} padding="sm">
      <Typography variant="h4" color="accent" className={cn(`${BLOCK_NAME}__title`)}>
        Выберите период
      </Typography>
      <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__description`)}>
        Получите детализированный отчёт WB через API за нужный период.
      </Typography>

      <UiFlex wrap="wrap" gap={8} align="center" className={cn(`${BLOCK_NAME}__presets`)}>
        {PRESET_CONFIG.map(({key, label}) => (
          <button
            key={key}
            type="button"
            className={cn(
              `${BLOCK_NAME}__preset`,
              activePreset === key && `${BLOCK_NAME}__preset--active`,
            )}
            onClick={() => handlePresetClick(key)}
          >
            {label}
          </button>
        ))}
      </UiFlex>

      <div className={cn(`${BLOCK_NAME}__picker-row`)}>
        <Typography variant="body3" color="muted" semiBold>
          Период:
        </Typography>
        <RangePicker
          value={dateRange}
          onChange={handleRangeChange}
          format="DD.MM.YYYY"
          placeholder={['Начало', 'Конец']}
          allowClear
          className={cn(`${BLOCK_NAME}__range-picker`)}
          disabled={isFetching}
        />
      </div>

      <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__hint`)}>
        Будет получен отчёт WB за выбранный период.
      </Typography>

      {validationError && (
        <Alert type="error" showIcon message={validationError} className={cn(`${BLOCK_NAME}__error`)} />
      )}

      <Button
        type="primary"
        block
        disabled={isFetchDisabled}
        loading={isFetching}
        onClick={handleFetch}
        className={cn(`${BLOCK_NAME}__fetch-button`)}
      >
        {fetchButtonText}
      </Button>
    </UiCard>
  )
}
