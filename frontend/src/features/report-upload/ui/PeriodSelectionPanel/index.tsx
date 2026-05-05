import classNames from 'classnames/bind'
import DatePicker from 'antd/es/date-picker'
import ruDatePickerLocale from 'antd/es/date-picker/locale/ru_RU'
import Button from 'antd/es/button'
import {useState, useMemo} from 'react'
import type {Dayjs} from 'dayjs'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/ru'
import {UiCard} from '@/shared/ui-kit/card'
import {UiFlex} from '@/shared/ui-kit/flex'
import {Typography} from '@/shared/ui-kit/typography'
import styles from './index.module.scss'

dayjs.extend(isoWeek)
dayjs.locale('ru')

const cn = classNames.bind(styles)
const BLOCK_NAME = 'PeriodSelectionPanel'

const {RangePicker} = DatePicker

type PeriodPreset = 'lastWeek' | 'last2Weeks' | 'last4Weeks' | 'custom'

const PRESET_CONFIG: {key: PeriodPreset; label: string}[] = [
  {key: 'lastWeek', label: 'Прошлая неделя'},
  {key: 'last2Weeks', label: '2 недели'},
  {key: 'last4Weeks', label: '4 недели'},
  {key: 'custom', label: 'Свой период'},
]

function normalizeToWeekRange(from: Dayjs, to: Dayjs): [Dayjs, Dayjs] {
  return [from.startOf('isoWeek'), to.endOf('isoWeek')]
}

function getPresetRange(preset: PeriodPreset): [Dayjs, Dayjs] | null {
  const today = dayjs()
  const lastWeek = today.subtract(1, 'week')
  switch (preset) {
    case 'lastWeek':
      return normalizeToWeekRange(lastWeek, lastWeek)
    case 'last2Weeks':
      return normalizeToWeekRange(today.subtract(2, 'week'), lastWeek)
    case 'last4Weeks':
      return normalizeToWeekRange(today.subtract(4, 'week'), lastWeek)
    case 'custom':
      return null
  }
}

function getCalendarPanelMonths(): [Dayjs, Dayjs] {
  const today = dayjs()
  return [today.subtract(1, 'month'), today]
}

function formatWeekRange(value: Dayjs): string {
  const start = value.startOf('isoWeek').format('DD.MM.YYYY')
  const end = value.endOf('isoWeek').format('DD.MM.YYYY')
  return `${start} - ${end}`
}

function isFullWeekRange(from: Dayjs, to: Dayjs): boolean {
  return from.isoWeekday() === 1 && to.isoWeekday() === 7
}

type PeriodSelectionPanelProps = {
  isFetching?: boolean
  hasFetchedReport?: boolean
  hasResults?: boolean
  fetchedPeriodStart?: string | null
  fetchedPeriodEnd?: string | null
  fetchedRowCount?: number | null
  fetchError?: string
  rateLimitRetryAfter?: number | null
  onFetchReport?: (dateFrom: string, dateTo: string) => void
  onReset?: () => void
  onDownloadPdf?: () => void
}

export function PeriodSelectionPanel({
  isFetching = false,
  hasFetchedReport = false,
  hasResults = false,
  fetchedPeriodStart,
  fetchedPeriodEnd,
  fetchedRowCount,
  fetchError,
  rateLimitRetryAfter,
  onFetchReport,
  onReset,
  onDownloadPdf,
}: PeriodSelectionPanelProps) {
  const [activePreset, setActivePreset] = useState<PeriodPreset | null>(null)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [validationError, setValidationError] = useState('')
  const calendarPanelMonths = useMemo(() => getCalendarPanelMonths(), [])

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
    if (!values?.[0] || !values?.[1]) {
      setDateRange(values)
      return
    }

    setDateRange(normalizeToWeekRange(values[0], values[1]))
  }

  function handleFetch() {
    if (!dateRange?.[0] || !dateRange?.[1]) return

    const from = dateRange[0]
    const to = dateRange[1]

    if (from.isAfter(to)) {
      setValidationError('Дата начала не может быть позже даты окончания.')
      return
    }

    if (!isFullWeekRange(from, to)) {
      setValidationError('Выберите период полными неделями: с понедельника по воскресенье.')
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
        <UiCard
          className={cn(`${BLOCK_NAME}__success-card`)}
          padding="sm"
          style={{background: 'var(--color-success-bg)', borderColor: 'var(--color-success-border)'}}
        >
          <UiFlex align="center" gap={8}>
            <span className={cn(`${BLOCK_NAME}__success-icon`)}>
              ✓
            </span>
            <Typography variant="body3" color="positive">
              Отчёт получен через API
            </Typography>
          </UiFlex>
        </UiCard>
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
          {onDownloadPdf && (
            <Button onClick={onDownloadPdf} disabled={!hasResults}>
              Скачать метрики в PDF
            </Button>
          )}
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
          picker="week"
          showWeek={false}
          value={dateRange}
          onChange={handleRangeChange}
          format={formatWeekRange}
          locale={ruDatePickerLocale}
          defaultPickerValue={calendarPanelMonths}
          placeholder={['Начальная неделя', 'Конечная неделя']}
          allowClear
          inputReadOnly
          className={cn(`${BLOCK_NAME}__range-picker`)}
          disabled={isFetching}
        />
      </div>

      <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__hint`)}>
        Будет получен отчёт WB за полные недели с понедельника по воскресенье.
      </Typography>

      {(validationError || fetchError) && (
        <UiCard
          className={cn(`${BLOCK_NAME}__error-card`)}
          padding="sm"
          style={{background: 'var(--color-error-bg)', borderColor: 'var(--color-error-border)'}}
        >
          <UiFlex align="center" gap={8}>
            <span className={cn(`${BLOCK_NAME}__error-icon`)}>
              ✕
            </span>
            <Typography variant="body3" color="negative">
              {validationError || fetchError}
              {rateLimitRetryAfter != null && (
                <>
                  {' '}
                  Повторная попытка через {rateLimitRetryAfter} сек.
                </>
              )}
            </Typography>
          </UiFlex>
        </UiCard>
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
