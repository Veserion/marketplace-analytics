import type { ValueType } from '../types/reports'

export function parseCsv(content: string, delimiter = ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]

    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        cell += '"'
        i += 1
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
      if (ch === '\r' && content[i + 1] === '\n') i += 1
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

export function normalize(value: string | undefined): string {
  return (value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseNumber(value: string | undefined): number | null {
  const normalized = normalize(value)
    .replace(/[₽%]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.')

  if (!normalized) return null
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatValue(value: number | null, type: ValueType): string {
  if (value === null) return 'n/a'
  if (type === 'percent') return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}%`
  if (type === 'currency') return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
}
