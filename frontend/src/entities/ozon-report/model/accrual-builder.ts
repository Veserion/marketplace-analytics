import { OZON_ACCRUAL_COLUMNS, OZON_CSV_LAYOUT } from '@/entities/ozon-report/model/columns'
import type { AccrualGroup, AccrualMetric, ValueType } from '@/entities/ozon-report/model/types'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'
import type { CsvTable } from '@/shared/lib/reporting'
import { addToNumberMap, assertCsvColumns, createCsvTable, findHeaderRowIndex, formatSharePercent, isArticleIncludedByPattern, normalizeArticleKey, normalizeLower, sortByAbsDesc, stripBom } from '@/shared/lib/reporting'

const GROUPED_EXPENSES_REPORT_TITLE = 'Общие затраты по Маркетплейсу'
const SALES_GROUP_LABEL = 'Продажи'

function formatDateLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = String(date.getUTCFullYear())
  return `${day}.${month}.${year}`
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null
  if (serial < 1 || serial > 100000) return null
  const timestamp = Date.UTC(1899, 11, 30) + Math.round(serial) * 24 * 60 * 60 * 1000
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseAccrualDateLabelToTimestamp(raw: string): number | null {
  const normalized = normalize(raw)
  if (!normalized || normalized === 'Без даты') return null

  const serialMatch = normalized.match(/^\d+(?:[.,]\d+)?$/)
  if (serialMatch) {
    const serial = Number(normalized.replace(',', '.'))
    const date = excelSerialToDate(serial)
    return date ? date.getTime() : null
  }

  const [day, month, year] = normalized.split('.').map(Number)
  if ([day, month, year].some((part) => Number.isNaN(part))) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function normalizeAccrualDateLabel(raw: string): string {
  const normalized = normalize(raw)
  if (!normalized) return ''
  const timestamp = parseAccrualDateLabelToTimestamp(normalized)
  if (timestamp === null) return normalized
  return formatDateLabel(new Date(timestamp))
}

type OzonAccrualAggregate = {
  rowCount: number
  cogsFromUnitMap: number | null
  sumByGroup: Map<string, number>
  sumByDate: Map<string, number>
  sumByScheme: Map<string, number>
  groupTypeBreakdown: Map<string, Map<string, number>>
  total: number
  salesQuantity: number
  cancellationsAndReturnsQuantity: number
  revenueWithoutSppSales: number
  revenueBeforeSppSales: number
  marketplaceExpenses: number
  returnsAmount: number
}

function toAccrualMetrics(
  entries: [string, number][],
  formulaBuilder: (label: string) => string,
  type: ValueType = 'currency',
): AccrualMetric[] {
  return entries.map(([label, value]) => ({ label, value, type, formula: formulaBuilder(label) }))
}

function calculateOzonAccrualCogs(
  dataRows: string[][],
  table: CsvTable,
  cogsByArticleMap: Map<string, number> | null,
): number | null {
  if (!cogsByArticleMap || cogsByArticleMap.size === 0) return null
  if (
    !table.colIndex.has(OZON_ACCRUAL_COLUMNS.article)
    || !table.colIndex.has(OZON_ACCRUAL_COLUMNS.qty)
    || !table.colIndex.has(OZON_ACCRUAL_COLUMNS.accrualType)
  ) {
    return null
  }

  let total = 0
  let matchedRows = 0
  for (const row of dataRows) {
    const accrualType = normalizeLower(table.getCell(row, OZON_ACCRUAL_COLUMNS.accrualType))
    if (accrualType !== 'выручка') continue
    const articleKey = normalizeArticleKey(table.getCell(row, OZON_ACCRUAL_COLUMNS.article))
    const quantity = parseNumber(table.getCell(row, OZON_ACCRUAL_COLUMNS.qty))
    if (!articleKey || quantity === null) continue
    const unitCost = cogsByArticleMap.get(articleKey)
    if (unitCost === undefined) continue
    total += quantity * unitCost
    matchedRows += 1
  }
  return matchedRows > 0 ? total : null
}

function aggregateOzonAccrualRows(
  dataRows: string[][],
  table: CsvTable,
  cogsByArticleMap: Map<string, number> | null,
): OzonAccrualAggregate {
  const aggregate: OzonAccrualAggregate = {
    rowCount: dataRows.length,
    cogsFromUnitMap: calculateOzonAccrualCogs(dataRows, table, cogsByArticleMap),
    sumByGroup: new Map<string, number>(),
    sumByDate: new Map<string, number>(),
    sumByScheme: new Map<string, number>(),
    groupTypeBreakdown: new Map<string, Map<string, number>>(),
    total: 0,
    salesQuantity: 0,
    cancellationsAndReturnsQuantity: 0,
    revenueWithoutSppSales: 0,
    revenueBeforeSppSales: 0,
    marketplaceExpenses: 0,
    returnsAmount: 0,
  }

  for (const row of dataRows) {
    const amount = parseNumber(table.getCell(row, OZON_ACCRUAL_COLUMNS.amount))
    if (amount === null) continue

    const group = normalize(table.getCell(row, OZON_ACCRUAL_COLUMNS.serviceGroup)) || 'Без группы'
    const type = normalize(table.getCell(row, OZON_ACCRUAL_COLUMNS.accrualType)) || 'Без типа'
    const date = normalizeAccrualDateLabel(table.getCell(row, OZON_ACCRUAL_COLUMNS.accrualDate)) || 'Без даты'
    const scheme = normalize(table.getCell(row, OZON_ACCRUAL_COLUMNS.scheme))

    aggregate.total += amount

    const groupLower = normalizeLower(group)
    const typeLower = normalizeLower(type)
    const isReturnRow = groupLower.includes('возврат')
    const quantity = parseNumber(table.getCell(row, OZON_ACCRUAL_COLUMNS.qty))
    if (typeLower === 'выручка' && quantity !== null) {
      aggregate.salesQuantity += quantity
    }
    if (groupLower === 'продажи' && typeLower === 'выручка') {
      aggregate.revenueWithoutSppSales += amount
    }
    if (groupLower === 'продажи') {
      aggregate.revenueBeforeSppSales += amount
    } else if (!isReturnRow) {
      aggregate.marketplaceExpenses += amount
    }
    if (isReturnRow) {
      aggregate.returnsAmount += amount
    }
    if (typeLower === 'обратная логистика' && quantity !== null) {
      aggregate.cancellationsAndReturnsQuantity += quantity
    }
    addToNumberMap(aggregate.sumByGroup, group, amount)
    addToNumberMap(aggregate.sumByDate, date, amount)
    if (scheme) {
      addToNumberMap(aggregate.sumByScheme, scheme, amount)
    }

    if (!aggregate.groupTypeBreakdown.has(group)) {
      aggregate.groupTypeBreakdown.set(group, new Map<string, number>())
    }
    addToNumberMap(aggregate.groupTypeBreakdown.get(group)!, type, amount)
  }

  return aggregate
}

function classifyOzonAccrualGroup(rawLabel: string): { label: string, withSalesShare: boolean } {
  const normalizedLabel = normalizeLower(rawLabel)

  if (
    (normalizedLabel.includes('вознагражден') && normalizedLabel.includes('ozon'))
    || (normalizedLabel.includes('вознагражден') && normalizedLabel.includes('озон'))
  ) {
    return { label: 'Комиссия Ozon', withSalesShare: true }
  }
  if (normalizedLabel.includes('услуги доставки')) {
    return { label: 'Логистика', withSalesShare: true }
  }
  if (normalizedLabel.includes('возврат')) {
    return { label: 'Возвраты', withSalesShare: true }
  }
  if (normalizedLabel.includes('продвижен') && normalizedLabel.includes('реклам')) {
    return { label: 'Продвижение', withSalesShare: true }
  }
  if (normalizedLabel.includes('услуги фбо') || normalizedLabel.includes('fbo')) {
    return { label: 'Услуги ФБО', withSalesShare: true }
  }
  if (normalizedLabel.includes('услуги партнер')) {
    return { label: 'Услуги партнеров', withSalesShare: true }
  }
  if (normalizedLabel.includes('другие услуги') || normalizedLabel.includes('штраф')) {
    return { label: 'Другие услуги и штрафы', withSalesShare: true }
  }
  return { label: rawLabel, withSalesShare: false }
}

function buildOzonGroupedExpenseMetrics(
  sumByGroup: Map<string, number>,
  marketplaceExpenses: number,
  salesBase: number | null,
): AccrualMetric[] {
  const groupedAccrualByLabel = new Map<string, { value: number, withSalesShare: boolean, sourceLabels: Set<string> }>()
  for (const [rawLabel, value] of sortByAbsDesc(Array.from(sumByGroup.entries()))) {
    const group = classifyOzonAccrualGroup(rawLabel)
    const current = groupedAccrualByLabel.get(group.label) || {
      value: 0,
      withSalesShare: group.withSalesShare,
      sourceLabels: new Set<string>(),
    }
    current.value += value
    current.withSalesShare = current.withSalesShare || group.withSalesShare
    current.sourceLabels.add(rawLabel)
    groupedAccrualByLabel.set(group.label, current)
  }

  const groupMetrics = sortByAbsDesc(
    Array.from(groupedAccrualByLabel.entries()).map(([label, data]) => [label, data.value] as [string, number]),
  )
    .filter(([label]) => label !== SALES_GROUP_LABEL)
    .map(([label, value]) => {
      const data = groupedAccrualByLabel.get(label)!
      const labelsForFormula = Array.from(data.sourceLabels)
      const formula = labelsForFormula.length === 1
        ? `SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "${labelsForFormula[0]}"`
        : `SUM("Сумма итого, руб."), фильтр: "Группа услуг" IN (${labelsForFormula.map((item) => `"${item}"`).join(', ')})`
      return {
        label,
        value,
        type: 'currency' as const,
        formula,
        shareText: data.withSalesShare ? formatSharePercent(value, salesBase) : null,
      }
    })

  groupMetrics.push({
    label: 'Итог',
    value: -Math.abs(marketplaceExpenses),
    type: 'currency',
    formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" != "Продажи" и исключая возвраты',
    shareText: formatSharePercent(marketplaceExpenses, salesBase),
  })
  return groupMetrics
}

function buildOzonStructureSummaries(groupTypeBreakdown: Map<string, Map<string, number>>): AccrualGroup[] {
  return Array.from(groupTypeBreakdown.entries())
    .map(([group, types]) => {
      const topTypes = sortByAbsDesc(Array.from(types.entries())).slice(0, 3)
      const groupTotal = Array.from(types.values()).reduce((acc, value) => acc + value, 0)
      return {
        title: `Структура: ${group}`,
        metrics: toAccrualMetrics(
          topTypes,
          (label) => `SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "${group}" и "Тип начисления" = "${label}"`,
        ),
        total: groupTotal,
      }
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map(({ title, metrics }) => ({ title, metrics }))
}

function buildOzonAccrualPeriodLabel(sumByDate: Map<string, number>): string | undefined {
  const timestamps = Array.from(sumByDate.keys())
    .map((label) => parseAccrualDateLabelToTimestamp(label))
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((a, b) => a - b)
  if (timestamps.length === 0) return undefined
  const formatter = new Intl.DateTimeFormat('ru-RU')
  const from = formatter.format(new Date(timestamps[0]))
  const to = formatter.format(new Date(timestamps[timestamps.length - 1]))
  return from === to ? from : `${from} - ${to}`
}

function buildOzonAccrualReportGroups(
  aggregate: OzonAccrualAggregate,
  vatRatePercent: number,
  taxRatePercent: number,
): AccrualGroup[] {
  const revenueByStore = aggregate.revenueWithoutSppSales + aggregate.returnsAmount
  const amountBeforeSpp = aggregate.revenueBeforeSppSales + aggregate.returnsAmount
  const salesBase = amountBeforeSpp > 0 ? amountBeforeSpp : null
  const sppAndPromotions = amountBeforeSpp - revenueByStore
  const totalTaxRate = (vatRatePercent + taxRatePercent) / 100
  const tax11 = amountBeforeSpp * totalTaxRate
  const cogsForNetProfit = aggregate.cogsFromUnitMap ?? 0
  const netProfit = aggregate.total - tax11 - cogsForNetProfit
  const marginRate = revenueByStore !== 0 ? (netProfit / revenueByStore) * 100 : null
  const groupMetrics = buildOzonGroupedExpenseMetrics(
    aggregate.sumByGroup,
    aggregate.marketplaceExpenses,
    salesBase,
  )

  return [
    {
      title: 'Итоги периода',
      rowCount: aggregate.rowCount,
      periodLabel: buildOzonAccrualPeriodLabel(aggregate.sumByDate),
      metrics: [
        {
          label: 'Количество продаж',
          value: aggregate.salesQuantity,
          type: 'number',
          formula: 'SUM("Количество"), фильтр: "Тип начисления" = "Выручка"',
        },
        {
          label: 'Отмены, возвраты, не выкупы',
          value: aggregate.cancellationsAndReturnsQuantity,
          type: 'number',
          formula: 'SUM("Количество"), фильтр: "Тип начисления" = "Обратная логистика"',
        },
        {
          label: 'Выручка с учетом СПП',
          value: amountBeforeSpp,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "Продажи" + SUM возвратов',
        },
        {
          label: 'Выручка без СПП',
          value: revenueByStore,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "Продажи" и "Тип начисления" = "Выручка" + SUM возвратов',
        },
        {
          label: 'Возвраты',
          value: aggregate.returnsAmount,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" содержит "возврат"',
        },
        {
          label: 'СПП и акции',
          value: sppAndPromotions,
          type: 'currency',
          formula: 'Выручка с учетом СПП - Выручка без СПП',
        },
        {
          label: 'Общие затраты по Маркетплейсу',
          value: aggregate.marketplaceExpenses,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг" != "Продажи" и исключая возвраты',
          shareText: formatSharePercent(aggregate.marketplaceExpenses, salesBase),
        },
        { label: 'Перевод в банк', value: aggregate.total, type: 'currency', formula: 'SUM("Сумма итого, руб.") по всем строкам начислений' },
        {
          label: 'Себестоимость',
          value: aggregate.cogsFromUnitMap,
          type: 'currency',
          formula: 'Σ("Количество" * "Себестоимость артикула"), где "Тип начисления" = "Выручка", а себестоимость артикула берется из отчета "Юнит экономика" за тот же период',
        },
        {
          label: 'Налог',
          value: tax11,
          type: 'currency',
          formula: `(${vatRatePercent}% + ${taxRatePercent}%) * Выручка с учетом СПП`,
        },
        {
          label: 'Маржинальность',
          value: marginRate,
          type: 'percent',
          formula: 'Чистая прибыль / Выручка без СПП * 100%',
        },
        {
          label: 'Чистая прибыль',
          value: netProfit,
          type: 'currency',
          formula: 'Перевод в банк - Налог - Себестоимость',
        },
      ],
    },
    {
      title: GROUPED_EXPENSES_REPORT_TITLE,
      metrics: groupMetrics,
    },
    {
      title: 'Схема работы',
      metrics: toAccrualMetrics(
        sortByAbsDesc(Array.from(aggregate.sumByScheme.entries())),
        (label) => `SUM("Сумма итого, руб."), фильтр: "Схема работы" = "${label}"`,
      ),
    },
    {
      title: 'Динамика по датам начисления',
      metrics: Array.from(aggregate.sumByDate.entries())
        .sort(([a], [b]) => {
          const aTs = parseAccrualDateLabelToTimestamp(a)
          const bTs = parseAccrualDateLabelToTimestamp(b)
          if (aTs !== null && bTs !== null) return aTs - bTs
          if (aTs !== null) return -1
          if (bTs !== null) return 1
          return a.localeCompare(b, 'ru')
        })
        .map(([label, value]) => ({
          label,
          value,
          type: 'currency',
          formula: `SUM("Сумма итого, руб."), фильтр: "Дата начисления" = "${label}"`,
        })),
    },
    ...buildOzonStructureSummaries(aggregate.groupTypeBreakdown),
  ]
}

export function buildAccrualReports(
  rawCsv: string,
  vatRatePercent = 5,
  taxRatePercent = 6,
  cogsByArticleMap: Map<string, number> | null = null,
  articlePattern = '*',
  excludePattern = false,
): AccrualGroup[] {
  const rows = parseCsv(stripBom(rawCsv), OZON_CSV_LAYOUT.delimiter)
  const headerIndex = findHeaderRowIndex(rows, [
    OZON_CSV_LAYOUT.accrualHeaderFirstCell,
    OZON_CSV_LAYOUT.accrualHeaderSecondCell,
    OZON_ACCRUAL_COLUMNS.amount,
    OZON_ACCRUAL_COLUMNS.serviceGroup,
  ])
  if (headerIndex === -1) {
    throw new Error('Не найдена строка заголовков отчета по начислениям.')
  }

  const table = createCsvTable(rows, headerIndex)
  assertCsvColumns(table, [
    OZON_ACCRUAL_COLUMNS.article,
    OZON_ACCRUAL_COLUMNS.qty,
    OZON_ACCRUAL_COLUMNS.accrualType,
    OZON_ACCRUAL_COLUMNS.amount,
    OZON_ACCRUAL_COLUMNS.serviceGroup,
    OZON_ACCRUAL_COLUMNS.accrualDate,
  ], 'начислений Ozon')
  const dataRows = table.dataRows.filter((row) => isArticleIncludedByPattern(
    normalize(table.getCell(row, OZON_ACCRUAL_COLUMNS.article)),
    articlePattern,
    excludePattern,
  ))
  const aggregate = aggregateOzonAccrualRows(dataRows, table, cogsByArticleMap)

  return buildOzonAccrualReportGroups(aggregate, vatRatePercent, taxRatePercent)
}
