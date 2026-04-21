import { AD_COLS, METRICS, OTHER_EXPENSE_COLS } from '../../constants/metrics'
import type { AccrualGroup, AccrualMetric, ReportGroup, ValueType } from '../../types/reports'
import { normalize, parseCsv, parseNumber } from '../../utils/csv'

function buildUnitEconomicsReport(
  rowsSubset: string[][],
  headers: string[],
  getCell: (row: string[], colName: string) => string,
  title: string,
): ReportGroup {
  const headerSet = new Set(headers)

  const sumCol = (name: string): number | null => {
    if (!headerSet.has(name)) return null
    let sum = 0
    for (const row of rowsSubset) {
      const n = parseNumber(getCell(row, name))
      if (n !== null) sum += n
    }
    return sum
  }

  const sales = sumCol('Заказано товаров, шт')
  const delivered = sumCol('Доставлено товаров, шт')
  const returns = sumCol('Возвращено товаров, шт')
  const revenue = sumCol('Выручка')
  const commission = sumCol('Вознаграждение Ozon')
  const logistics = sumCol('Логистика')
  const acquiring = sumCol('Эквайринг')
  const periodProfit = sumCol('Прибыль за период')
  const tax = revenue !== null ? revenue * 0.11 : null

  const hasAdsCols = AD_COLS.every((col) => headerSet.has(col))
  const adsCost = hasAdsCols ? AD_COLS.reduce((acc, col) => acc + (sumCol(col) || 0), 0) : null

  const hasOtherCols = OTHER_EXPENSE_COLS.every((col) => headerSet.has(col))
  const otherExpenses = hasOtherCols ? OTHER_EXPENSE_COLS.reduce((acc, col) => acc + (sumCol(col) || 0), 0) : null

  const cogs = rowsSubset.reduce((acc, row) => {
    const unitCost = parseNumber(getCell(row, 'Себестоимость'))
    const d = parseNumber(getCell(row, 'Доставлено товаров, шт'))
    const r = parseNumber(getCell(row, 'Возвращено товаров, шт'))
    if (unitCost === null || d === null || r === null) return acc
    return acc + unitCost * (d - r)
  }, 0)

  const buyout = delivered !== null && returns !== null ? delivered - returns : null
  const buyoutRate = buyout !== null && sales && sales !== 0 ? (buyout / sales) * 100 : null
  const netRevenue = periodProfit !== null && tax !== null ? periodProfit - tax : null
  const marginRate = netRevenue !== null && revenue && revenue !== 0 ? (netRevenue / revenue) * 100 : null
  const drr = adsCost !== null && revenue && revenue !== 0 ? (adsCost / revenue) * 100 : null

  const values: Record<(typeof METRICS)[number]['key'], number | null> = {
    sales,
    returns,
    buyout,
    buyoutRate,
    revenueBeforeSpp: revenue,
    commission,
    logistics,
    acquiring,
    tax,
    cogs,
    adsCost,
    otherExpenses,
    netRevenue,
    marginRate,
    drr,
  }

  const metrics = METRICS.map((metric) => ({
    ...metric,
    value: values[metric.key],
    ok: values[metric.key] !== null,
  }))

  return { title, rowCount: rowsSubset.length, metrics }
}

export function buildUnitEconomicsReports(rawCsv: string): ReportGroup[] {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), ';')
  const headerIndex = rows.findIndex((row) => normalize(row[0]) === 'SKU')
  if (headerIndex === -1) {
    throw new Error('Не найдена строка заголовков с колонкой SKU.')
  }

  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))

  const dataRows = rows.slice(headerIndex + 1).filter((row) => normalize(row[0]) !== '')

  const getCell = (row: string[], colName: string): string => {
    const idx = colIndex.get(colName)
    if (idx === undefined) return ''
    return row[idx] || ''
  }

  const stRows = dataRows.filter((row) => normalize(getCell(row, 'Артикул')).toLowerCase().startsWith('st'))
  const otherRows = dataRows.filter((row) => !normalize(getCell(row, 'Артикул')).toLowerCase().startsWith('st'))

  return [
    buildUnitEconomicsReport(stRows, headers, getCell, 'Артикул начинается с "st"'),
    buildUnitEconomicsReport(otherRows, headers, getCell, 'Все остальные товары'),
  ]
}

export function buildAccrualReports(rawCsv: string): AccrualGroup[] {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), ';')
  const headerIndex = rows.findIndex(
    (row) => normalize(row[0]) === 'ID начисления' && normalize(row[1]) === 'Дата начисления',
  )
  if (headerIndex === -1) {
    throw new Error('Не найдена строка заголовков отчета по начислениям.')
  }

  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))

  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => normalize(cell) !== ''))

  const getCell = (row: string[], colName: string): string => {
    const idx = colIndex.get(colName)
    if (idx === undefined) return ''
    return row[idx] || ''
  }

  const sumByGroup = new Map<string, number>()
  const sumByType = new Map<string, number>()
  const sumByDate = new Map<string, number>()
  const sumByScheme = new Map<string, number>()
  const sumByPlatform = new Map<string, number>()
  const groupTypeBreakdown = new Map<string, Map<string, number>>()

  let total = 0
  let positive = 0
  let negative = 0
  let positiveCount = 0
  let negativeCount = 0
  let zeroCount = 0

  const addToMap = (map: Map<string, number>, key: string, value: number): void => {
    map.set(key, (map.get(key) || 0) + value)
  }

  for (const row of dataRows) {
    const amount = parseNumber(getCell(row, 'Сумма итого, руб.'))
    if (amount === null) continue

    const group = normalize(getCell(row, 'Группа услуг')) || 'Без группы'
    const type = normalize(getCell(row, 'Тип начисления')) || 'Без типа'
    const date = normalize(getCell(row, 'Дата начисления')) || 'Без даты'
    const scheme = normalize(getCell(row, 'Схема работы')) || '(пусто)'
    const platform = normalize(getCell(row, 'Платформа продажи')) || '(пусто)'

    total += amount
    if (amount > 0) {
      positive += amount
      positiveCount += 1
    } else if (amount < 0) {
      negative += amount
      negativeCount += 1
    } else {
      zeroCount += 1
    }

    addToMap(sumByGroup, group, amount)
    addToMap(sumByType, type, amount)
    addToMap(sumByDate, date, amount)
    addToMap(sumByScheme, scheme, amount)
    addToMap(sumByPlatform, platform, amount)

    if (!groupTypeBreakdown.has(group)) {
      groupTypeBreakdown.set(group, new Map<string, number>())
    }
    addToMap(groupTypeBreakdown.get(group)!, type, amount)
  }

  const sortByAbsDesc = (entries: [string, number][]): [string, number][] =>
    entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

  const toMetrics = (
    entries: [string, number][],
    formulaBuilder: (label: string) => string,
    type: ValueType = 'currency',
  ): AccrualMetric[] =>
    entries.map(([label, value]) => ({ label, value, type, formula: formulaBuilder(label) }))

  const groupSummaries: AccrualGroup[] = Array.from(groupTypeBreakdown.entries())
    .map(([group, types]) => {
      const topTypes = sortByAbsDesc(Array.from(types.entries())).slice(0, 3)
      const groupTotal = Array.from(types.values()).reduce((acc, value) => acc + value, 0)
      return {
        title: `Структура: ${group}`,
        metrics: toMetrics(
          topTypes,
          (label) => `SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "${group}" и "Тип начисления" = "${label}"`,
        ),
        total: groupTotal,
      }
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map(({ title, metrics }) => ({ title, metrics }))

  return [
    {
      title: 'Итоги периода',
      rowCount: dataRows.length,
      metrics: [
        { label: 'Итог по начислениям', value: total, type: 'currency', formula: 'SUM("Сумма итого, руб.")' },
        { label: 'Положительные начисления', value: positive, type: 'currency', formula: 'SUM("Сумма итого, руб." > 0)' },
        { label: 'Отрицательные начисления', value: negative, type: 'currency', formula: 'SUM("Сумма итого, руб." < 0)' },
        { label: 'Среднее начисление на строку', value: dataRows.length ? total / dataRows.length : null, type: 'currency', formula: 'SUM("Сумма итого, руб.") / COUNT(строк)' },
        { label: 'Строк с плюсами', value: positiveCount, type: 'number', formula: 'COUNT("Сумма итого, руб." > 0)' },
        { label: 'Строк с минусами', value: negativeCount, type: 'number', formula: 'COUNT("Сумма итого, руб." < 0)' },
        { label: 'Строк с нулем', value: zeroCount, type: 'number', formula: 'COUNT("Сумма итого, руб." = 0)' },
      ],
    },
    {
      title: 'Группы услуг',
      metrics: toMetrics(
        sortByAbsDesc(Array.from(sumByGroup.entries())),
        (label) => `SUM("Сумма итого, руб."), фильтр: "Группа услуг" = "${label}"`,
      ),
    },
    {
      title: 'Типы начислений (топ 15)',
      metrics: toMetrics(
        sortByAbsDesc(Array.from(sumByType.entries())).slice(0, 15),
        (label) => `SUM("Сумма итого, руб."), фильтр: "Тип начисления" = "${label}"`,
      ),
    },
    {
      title: 'Схема работы',
      metrics: toMetrics(
        sortByAbsDesc(Array.from(sumByScheme.entries())),
        (label) => `SUM("Сумма итого, руб."), фильтр: "Схема работы" = "${label}"`,
      ),
    },
    {
      title: 'Платформа продажи',
      metrics: toMetrics(
        sortByAbsDesc(Array.from(sumByPlatform.entries())),
        (label) => `SUM("Сумма итого, руб."), фильтр: "Платформа продажи" = "${label}"`,
      ),
    },
    {
      title: 'Динамика по датам начисления',
      metrics: Array.from(sumByDate.entries())
        .sort(([a], [b]) => {
          const [da, ma, ya] = a.split('.').map(Number)
          const [db, mb, yb] = b.split('.').map(Number)
          return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime()
        })
        .map(([label, value]) => ({
          label,
          value,
          type: 'currency',
          formula: `SUM("Сумма итого, руб."), фильтр: "Дата начисления" = "${label}"`,
        })),
    },
    ...groupSummaries,
  ]
}
