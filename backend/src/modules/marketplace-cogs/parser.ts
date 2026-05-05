import { createHash } from 'node:crypto'

export type CogsCsvRow = {
  article: string
  unitCost: number
}

export type ParsedCogsCsv = {
  compactCsv: string
  rows: CogsCsvRow[]
  hash: string
}

function parseCsv(content: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const ch = content[index]

    if (ch === '"') {
      if (inQuotes && content[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === delimiter && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[index + 1] === '\n') index += 1
      row.push(cell)
      cell = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      continue
    }

    cell += ch
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

function normalize(value: string | undefined): string {
  return (value ?? '').replace(/\uFEFF/g, '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeLower(value: string | undefined): string {
  return normalize(value).toLowerCase()
}

function parseNumber(value: string | undefined): number | null {
  const normalized = normalize(value)
    .replace(/[₽%]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.')

  if (!normalized) return null
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function escapeCsvCell(value: string | number): string {
  const text = String(value)
  if (!/[;"\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function rowsToSemicolonCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(';')).join('\n')
}

function findHeader(row: string[]): { articleIdx: number; cogsIdx: number } | null {
  const normalized = row.map(normalizeLower)
  const articleIdx = normalized.findIndex((cell) => cell === 'артикул')
  if (articleIdx === -1) return null

  const cogsIdx = normalized.findIndex((cell) => cell === 'себестоимость')
  if (cogsIdx === -1) return null

  return { articleIdx, cogsIdx }
}

function calculateHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function normalizeArticleKey(article: string): string {
  return normalize(article).toLowerCase()
}

export function extractArticleDigits(article: string): string | null {
  const digits = normalizeArticleKey(article).replace(/\D/g, '')
  return digits || null
}

export function parseCogsCsv(rawCsv: string): ParsedCogsCsv {
  const rowsByDelimiter = [parseCsv(rawCsv, ';'), parseCsv(rawCsv, ',')]
  const parsedRows = rowsByDelimiter.find((rows) => rows.some((row) => findHeader(row)))

  if (!parsedRows) {
    throw new Error('Некорректный CSV себестоимости: обязательны колонки "Артикул" и "Себестоимость".')
  }

  const headerIndex = parsedRows.findIndex((row) => findHeader(row))
  const header = findHeader(parsedRows[headerIndex])
  if (!header) {
    throw new Error('Некорректный CSV себестоимости: обязательны колонки "Артикул" и "Себестоимость".')
  }

  const cogsRows: CogsCsvRow[] = []
  for (const row of parsedRows.slice(headerIndex + 1)) {
    if (!row.some((cell) => normalize(cell) !== '')) continue
    const article = normalize(row[header.articleIdx])
    const unitCost = parseNumber(row[header.cogsIdx])
    if (!article || unitCost === null) continue
    cogsRows.push({ article, unitCost })
  }

  if (cogsRows.length === 0) {
    throw new Error('CSV себестоимости не содержит валидных строк.')
  }

  const compactCsv = rowsToSemicolonCsv([
    ['Артикул', 'Себестоимость'],
    ...cogsRows.map((row) => [row.article, row.unitCost]),
  ])

  return {
    compactCsv,
    rows: cogsRows,
    hash: calculateHash(compactCsv),
  }
}
