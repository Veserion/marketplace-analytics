import { AD_COLS, LOGISTICS_COLS, METRICS, OTHER_EXPENSE_COLS, REVERSE_LOGISTICS_COLS } from '@/entities/ozon-report/config/metrics'
import type { AccrualGroup, AccrualMetric, AvailabilityGroups, ReportGroup, ValueType } from '@/entities/ozon-report/model/types'
import { normalize, parseCsv, parseNumber } from '@/shared/lib/csv'

function patternToRegex(pattern: string): RegExp | null {
  const normalized = pattern.trim()
  if (!normalized) return null

  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')

  return new RegExp(`^${escaped}$`, 'i')
}

function matchesArticlePattern(article: string, pattern: string): boolean {
  const regex = patternToRegex(pattern)
  if (!regex) return true
  return regex.test(article)
}

function buildUnitEconomicsReport(
  rowsSubset: string[][],
  headers: string[],
  getCell: (row: string[], colName: string) => string,
  vatRatePercent: number,
  taxRatePercent: number,
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
  const accruedPoints = sumCol('Баллы за скидки') ?? sumCol('Баллы за скидки, руб.')
  const partnerCompensation = sumCol('Программы партнёров') ?? sumCol('Программы партнеров')
  const commission = sumCol('Вознаграждение Ozon') ?? sumCol('Комиссия Ozon')
  const sumDefinedCols = (names: string[]): number | null => {
    const values = names.map((name) => sumCol(name)).filter((v): v is number => v !== null)
    if (values.length === 0) return null
    return values.reduce((acc, value) => acc + value, 0)
  }

  const logistics = sumDefinedCols(LOGISTICS_COLS)
  const reverseLogistics = sumDefinedCols(REVERSE_LOGISTICS_COLS)
  const acquiring = sumCol('Эквайринг')
  const periodProfit = sumCol('Прибыль за период')

  const hasAdsCols = AD_COLS.every((col) => headerSet.has(col))
  const adsCost = hasAdsCols ? AD_COLS.reduce((acc, col) => acc + (sumCol(col) || 0), 0) : null

  const otherExpenses = sumDefinedCols(OTHER_EXPENSE_COLS)

  const cogs = rowsSubset.reduce((acc, row) => {
    const unitCost = parseNumber(getCell(row, 'Себестоимость'))
    const d = parseNumber(getCell(row, 'Доставлено товаров, шт'))
    const r = parseNumber(getCell(row, 'Возвращено товаров, шт'))
    if (unitCost === null || d === null || r === null) return acc
    return acc + unitCost * (d - r)
  }, 0)

  const buyout = delivered !== null && returns !== null ? delivered - returns : null
  const buyoutRate = buyout !== null && returns !== null && buyout + returns !== 0
    ? (buyout / (buyout + returns)) * 100
    : null
  const hasRevenueBeforeSppParts = revenue !== null || accruedPoints !== null || partnerCompensation !== null
  const revenueBeforeSpp = hasRevenueBeforeSppParts
    ? (revenue ?? 0) + (accruedPoints ?? 0) + (partnerCompensation ?? 0)
    : null
  const totalRate = (vatRatePercent + taxRatePercent) / 100
  const tax = revenueBeforeSpp !== null ? revenueBeforeSpp * totalRate : null
  const netRevenue = periodProfit !== null && tax !== null ? periodProfit - tax : null
  const marginRate = netRevenue !== null && revenue && revenue !== 0 ? (netRevenue / revenue) * 100 : null

  const values: Record<(typeof METRICS)[number]['key'], number | null> = {
    sales,
    returns,
    cancellations: null,
    buyout,
    buyoutRate,
    revenueBeforeSpp,
    revenueAfterSpp: revenue,
    accruedPoints,
    partnerCompensation,
    commission,
    logistics,
    reverseLogistics,
    acquiring,
    tax,
    cogs,
    adsCost,
    otherExpenses,
    netRevenue,
    marginRate,
  }

  const metrics = METRICS.map((metric) => {
    const value = values[metric.key]
    if (metric.key === 'tax') {
      return {
        ...metric,
        value,
        ok: value !== null,
        formula: `Налог(${taxRatePercent}%) + НДС(${vatRatePercent}%)`,
      }
    }
    return {
      ...metric,
      value,
      ok: value !== null,
    }
  })

  const availabilityGroups: AvailabilityGroups = {
    urgent: [],
    maintain: [],
    enough: [],
  }

  if (headerSet.has('Артикул') && headerSet.has('Доступность товаров')) {
    const urgent = new Set<string>()
    const maintain = new Set<string>()
    const enough = new Set<string>()

    for (const row of rowsSubset) {
      const article = normalize(getCell(row, 'Артикул'))
      const availability = normalize(getCell(row, 'Доступность товаров')).toLowerCase()
      if (!article || !availability) continue

      if (availability === 'срочно поставить') {
        urgent.add(article)
        continue
      }
      if (availability === 'поддерживайте остаток') {
        maintain.add(article)
        continue
      }
      if (availability === 'пока хватает') {
        enough.add(article)
      }
    }

    const sortArticles = (set: Set<string>): string[] => Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
    availabilityGroups.urgent = sortArticles(urgent)
    availabilityGroups.maintain = sortArticles(maintain)
    availabilityGroups.enough = sortArticles(enough)
  }

  const productMargins: { article: string, marginSharePercent: number, profitPerUnit: number | null }[] = []
  if (headerSet.has('Артикул') && headerSet.has('Доля от продаж')) {
    const marginByArticle = new Map<string, { marginSum: number, marginCount: number, profitSum: number, profitCount: number }>()
    for (const row of rowsSubset) {
      const article = normalize(getCell(row, 'Артикул'))
      const margin = parseNumber(getCell(row, 'Доля от продаж'))
      const profitPerUnit = parseNumber(getCell(row, 'Прибыль за шт'))
      if (!article || margin === null) continue

      const current = marginByArticle.get(article) || { marginSum: 0, marginCount: 0, profitSum: 0, profitCount: 0 }
      current.marginSum += margin
      current.marginCount += 1
      if (profitPerUnit !== null) {
        current.profitSum += profitPerUnit
        current.profitCount += 1
      }
      marginByArticle.set(article, current)
    }

    for (const [article, stats] of marginByArticle.entries()) {
      productMargins.push({
        article,
        marginSharePercent: stats.marginSum / stats.marginCount,
        profitPerUnit: stats.profitCount > 0 ? stats.profitSum / stats.profitCount : null,
      })
    }
  }

  return { title, rowCount: rowsSubset.length, metrics, availabilityGroups, productMargins }
}

export function buildUnitEconomicsReports(
  rawCsv: string,
  articlePattern: string,
  vatRatePercent: number,
  taxRatePercent: number,
): ReportGroup[] {
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

  const matchedRows = dataRows.filter((row) => matchesArticlePattern(normalize(getCell(row, 'Артикул')), articlePattern))
  const otherRows = dataRows.filter((row) => !matchesArticlePattern(normalize(getCell(row, 'Артикул')), articlePattern))
  const printablePattern = articlePattern.trim() || '*'

  return [
    buildUnitEconomicsReport(
      matchedRows,
      headers,
      getCell,
      vatRatePercent,
      taxRatePercent,
      `Артикул соответствует паттерну "${printablePattern}"`,
    ),
    buildUnitEconomicsReport(
      otherRows,
      headers,
      getCell,
      vatRatePercent,
      taxRatePercent,
      'Все остальные товары',
    ),
  ]
}

function normalizeArticleKey(article: string): string {
  return normalize(article).toLowerCase()
}

export function buildUnitArticleCogsMap(rawCsv: string): Map<string, number> | null {
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/, ''), ';')
  const headerIndex = rows.findIndex((row) => normalize(row[0]) === 'SKU')
  if (headerIndex === -1) return null

  const headers = rows[headerIndex].map((cell) => normalize(cell))
  const colIndex = new Map(headers.map((header, idx) => [header, idx]))
  const articleIdx = colIndex.get('Артикул')
  const unitCostIdx = colIndex.get('Себестоимость')
  if (articleIdx === undefined || unitCostIdx === undefined) {
    return null
  }

  const dataRows = rows.slice(headerIndex + 1).filter((row) => normalize(row[0]) !== '')
  const byArticle = new Map<string, { sum: number, count: number }>()
  for (const row of dataRows) {
    const article = normalizeArticleKey(row[articleIdx] || '')
    const unitCost = parseNumber(row[unitCostIdx] || '')
    if (!article || unitCost === null) continue
    const current = byArticle.get(article) || { sum: 0, count: 0 }
    current.sum += unitCost
    current.count += 1
    byArticle.set(article, current)
  }

  const result = new Map<string, number>()
  for (const [article, stats] of byArticle.entries()) {
    if (stats.count === 0) continue
    result.set(article, stats.sum / stats.count)
  }
  return result
}

export function buildAccrualReports(
  rawCsv: string,
  vatRatePercent = 5,
  taxRatePercent = 6,
  unitArticleCogsMap: Map<string, number> | null = null,
): AccrualGroup[] {
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

  const accrualCogsFromUnitMap = (() => {
    if (!unitArticleCogsMap || unitArticleCogsMap.size === 0) return null
    if (!colIndex.has('Артикул') || !colIndex.has('Количество') || !colIndex.has('Тип начисления')) return null

    let total = 0
    let matchedRows = 0
    for (const row of dataRows) {
      const accrualType = normalize(getCell(row, 'Тип начисления')).toLowerCase().replace(/ё/g, 'е')
      if (accrualType !== 'выручка') continue
      const articleKey = normalizeArticleKey(getCell(row, 'Артикул'))
      const quantity = parseNumber(getCell(row, 'Количество'))
      if (!articleKey || quantity === null) continue
      const unitCost = unitArticleCogsMap.get(articleKey)
      if (unitCost === undefined) continue
      total += quantity * unitCost
      matchedRows += 1
    }
    return matchedRows > 0 ? total : null
  })()

  const sumByGroup = new Map<string, number>()
  const sumByDate = new Map<string, number>()
  const sumByScheme = new Map<string, number>()
  const groupTypeBreakdown = new Map<string, Map<string, number>>()

  let total = 0
  let positive = 0
  let negative = 0
  let positiveCount = 0
  let negativeCount = 0
  let zeroCount = 0
  let sppPoints = 0
  let salesQuantity = 0
  let cancellationsAndReturnsQuantity = 0

  const addToMap = (map: Map<string, number>, key: string, value: number): void => {
    map.set(key, (map.get(key) || 0) + value)
  }

  const normalizeLower = (value: string): string => normalize(value).toLowerCase().replace(/ё/g, 'е')

  for (const row of dataRows) {
    const amount = parseNumber(getCell(row, 'Сумма итого, руб.'))
    if (amount === null) continue

    const group = normalize(getCell(row, 'Группа услуг')) || 'Без группы'
    const type = normalize(getCell(row, 'Тип начисления')) || 'Без типа'
    const date = normalize(getCell(row, 'Дата начисления')) || 'Без даты'
    const scheme = normalize(getCell(row, 'Схема работы'))

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

    const groupLower = normalizeLower(group)
    const typeLower = normalizeLower(type)
    const quantity = parseNumber(getCell(row, 'Количество'))
    if (typeLower === 'выручка' && quantity !== null) {
      salesQuantity += quantity
    }
    if (typeLower === 'обратная логистика' && quantity !== null) {
      cancellationsAndReturnsQuantity += quantity
    }
    if (
      (groupLower.includes('балл') && groupLower.includes('скид'))
      || (typeLower.includes('балл') && typeLower.includes('скид'))
      || groupLower.includes('спп')
      || typeLower.includes('спп')
    ) {
      sppPoints += amount
    }
    addToMap(sumByGroup, group, amount)
    addToMap(sumByDate, date, amount)
    if (scheme) {
      addToMap(sumByScheme, scheme, amount)
    }

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

  const salesBase = positive > 0 ? positive : null
  const salesByGroup = Array.from(sumByGroup.entries())
    .filter(([label]) => normalizeLower(label).includes('продаж'))
    .reduce((acc, [, value]) => acc + value, 0)
  const revenueByStore = salesByGroup !== 0 ? salesByGroup : positive
  const amountBeforeSpp = revenueByStore + sppPoints
  const totalTaxRate = (vatRatePercent + taxRatePercent) / 100
  const tax11 = amountBeforeSpp * totalTaxRate
  const marketplaceExpenses = negative
  const marketplaceExpensesAbs = Math.abs(marketplaceExpenses)
  const netProfit = revenueByStore - marketplaceExpensesAbs - tax11
  const marginRate = revenueByStore !== 0 ? (netProfit / revenueByStore) * 100 : null
  const formatSalesShare = (value: number): string | null => {
    if (!salesBase) return null
    const sharePercent = (Math.abs(value) / salesBase) * 100
    const formattedShare = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(sharePercent)
    return `${formattedShare}%`
  }
  const classifyGroup = (rawLabel: string): { label: string, withSalesShare: boolean } => {
    const normalizedLabel = normalize(rawLabel).toLowerCase().replace(/ё/g, 'е')

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
  const groupedAccrualByLabel = new Map<string, { value: number, withSalesShare: boolean, sourceLabels: Set<string> }>()
  for (const [rawLabel, value] of sortByAbsDesc(Array.from(sumByGroup.entries()))) {
    const group = classifyGroup(rawLabel)
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
  ).map(([label, value]) => {
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
      shareText: data.withSalesShare ? formatSalesShare(value) : null,
    }
  })

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
        {
          label: 'Выручка до СПП',
          value: amountBeforeSpp,
          type: 'currency',
          formula: 'Выручка по магазину + СПП (баллы)',
        },
        { label: 'Выручка без СПП', value: positive, type: 'currency', formula: 'SUM("Сумма итого, руб." > 0)' },
        {
          label: 'СПП (баллы)',
          value: sppPoints,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб."), фильтр: "Группа услуг"/"Тип начисления" содержит "СПП" или "баллы за скидки"',
        },
        {
          label: 'Общие затраты по Маркетплейсу',
          value: marketplaceExpenses,
          type: 'currency',
          formula: 'SUM("Сумма итого, руб." < 0)',
          shareText: salesBase ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format((Math.abs(marketplaceExpenses) / salesBase) * 100)}%` : null,
        },
        {
          label: 'Количество продаж',
          value: salesQuantity,
          type: 'number',
          formula: 'SUM("Количество"), фильтр: "Тип начисления" = "Выручка"',
        },
        {
          label: 'Отмена и возвраты',
          value: cancellationsAndReturnsQuantity,
          type: 'number',
          formula: 'SUM("Количество"), фильтр: "Тип начисления" = "Обратная логистика"',
        },
        ...(accrualCogsFromUnitMap !== null
          ? [{
              label: 'Себестоимость',
              value: accrualCogsFromUnitMap,
              type: 'currency' as const,
              formula: 'Σ("Количество" * "Себестоимость артикула"), где "Тип начисления" = "Выручка", а себестоимость артикула берется из отчета "Юнит экономика" за тот же период',
            }]
          : []),
        {
          label: 'Налог',
          value: tax11,
          type: 'currency',
          formula: `(${vatRatePercent}% + ${taxRatePercent}%) * Сумма до СПП`,
        },
        {
          label: 'Чистая прибыль',
          value: netProfit,
          type: 'currency',
          formula: 'Выручка по магазину - Общие затраты по Маркетплейсу - Налог',
        },
        {
          label: 'Маржинальность',
          value: marginRate,
          type: 'percent',
          formula: 'Чистая прибыль / Выручка по магазину * 100%',
        },
        { label: 'Перевод в банк', value: total, type: 'currency', formula: 'SUM("Сумма итого, руб.")' },
        { label: 'Среднее начисление на строку', value: dataRows.length ? total / dataRows.length : null, type: 'currency', formula: 'SUM("Сумма итого, руб.") / COUNT(строк)' },
        { label: 'Строк с плюсами', value: positiveCount, type: 'number', formula: 'COUNT("Сумма итого, руб." > 0)' },
        { label: 'Строк с минусами', value: negativeCount, type: 'number', formula: 'COUNT("Сумма итого, руб." < 0)' },
        { label: 'Строк с нулем', value: zeroCount, type: 'number', formula: 'COUNT("Сумма итого, руб." = 0)' },
      ],
    },
    {
      title: 'Начисления по группам',
      metrics: groupMetrics,
    },
    {
      title: 'Схема работы',
      metrics: toMetrics(
        sortByAbsDesc(Array.from(sumByScheme.entries())),
        (label) => `SUM("Сумма итого, руб."), фильтр: "Схема работы" = "${label}"`,
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
