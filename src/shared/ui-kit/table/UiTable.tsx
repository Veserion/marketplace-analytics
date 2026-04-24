import { useMemo, useState } from 'react'
import classNames from 'classnames/bind'
import styles from './UiTable.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'UiTable'

type SortDirection = 'asc' | 'desc'

type SortAccessorValue = string | number | null | undefined

export type UiTableColumn<T> = {
  key: string
  title: React.ReactNode
  renderCell: (row: T) => React.ReactNode
  width?: string
  filterable?: boolean
  filterPlaceholder?: string
  getFilterValue?: (row: T) => string
  sortable?: boolean
  getSortValue?: (row: T) => SortAccessorValue
}

type UiTableProps<T> = {
  columns: UiTableColumn<T>[]
  rows: T[]
  pinnedRows?: T[]
  rowKey: (row: T, index: number) => string
  emptyText?: string
  initialSort?: { key: string, direction: SortDirection } | null
  showHeaderFilters?: boolean
}

function compareSortValues(a: SortAccessorValue, b: SortAccessorValue, direction: SortDirection): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a
  }

  const left = String(a)
  const right = String(b)
  return direction === 'asc'
    ? left.localeCompare(right, 'ru')
    : right.localeCompare(left, 'ru')
}

export function UiTable<T>({
  columns,
  rows,
  pinnedRows = [],
  rowKey,
  emptyText = 'Нет данных',
  initialSort = null,
  showHeaderFilters = true,
}: UiTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sortState, setSortState] = useState<{ key: string, direction: SortDirection } | null>(initialSort)

  const preparedRows = useMemo(() => {
    const filtered = rows.filter((row) => columns.every((column) => {
      if (!column.filterable) return true
      const filterValue = (filters[column.key] || '').trim().toLowerCase()
      if (!filterValue) return true
      const source = (column.getFilterValue?.(row) ?? '').toLowerCase()
      return source.includes(filterValue)
    }))

    if (!sortState) return filtered
    const sortColumn = columns.find((column) => column.key === sortState.key && column.sortable)
    if (!sortColumn?.getSortValue) return filtered

    const copy = [...filtered]
    copy.sort((left, right) => compareSortValues(
      sortColumn.getSortValue?.(left),
      sortColumn.getSortValue?.(right),
      sortState.direction,
    ))
    return copy
  }, [columns, filters, rows, sortState])

  const toggleSort = (columnKey: string): void => {
    const targetColumn = columns.find((column) => column.key === columnKey)
    if (!targetColumn?.sortable) return
    setSortState((prev) => {
      if (!prev || prev.key !== columnKey) return { key: columnKey, direction: 'asc' }
      return { key: columnKey, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
  }

  return (
    <div className={cn(BLOCK_NAME)}>
      <table className={cn(`${BLOCK_NAME}__table`)}>
        <thead>
          <tr className={cn(`${BLOCK_NAME}__head-row`)}>
            {columns.map((column) => {
              const isSorted = sortState?.key === column.key
              const sortDirection = isSorted ? sortState?.direction : null
              return (
                <th key={column.key} className={cn(`${BLOCK_NAME}__th`)} style={column.width ? { width: column.width } : undefined}>
                  <div className={cn(`${BLOCK_NAME}__head-cell`)}>
                    <span className={cn(`${BLOCK_NAME}__title`)}>{column.title}</span>
                    {column.sortable && (
                      <button
                        className={cn(`${BLOCK_NAME}__sort-button`)}
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        aria-label={`Сортировать по колонке`}
                      >
                        {sortDirection === 'asc' ? '↑' : sortDirection === 'desc' ? '↓' : '↕'}
                      </button>
                    )}
                  </div>
                  {showHeaderFilters && column.filterable && (
                    <input
                      className={cn(`${BLOCK_NAME}__filter`)}
                      type="text"
                      value={filters[column.key] ?? ''}
                      placeholder={column.filterPlaceholder ?? 'Фильтр'}
                      onChange={(event) => {
                        const value = event.target.value
                        setFilters((prev) => ({ ...prev, [column.key]: value }))
                      }}
                    />
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {preparedRows.length === 0 && (
            <tr>
              <td className={cn(`${BLOCK_NAME}__empty`)} colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          )}
          {preparedRows.map((row, rowIndex) => (
            <tr key={rowKey(row, rowIndex)} className={cn(`${BLOCK_NAME}__row`)}>
              {columns.map((column) => (
                <td key={column.key} className={cn(`${BLOCK_NAME}__td`)}>
                  {column.renderCell(row)}
                </td>
              ))}
            </tr>
          ))}
          {pinnedRows.map((row, rowIndex) => (
            <tr key={rowKey(row, preparedRows.length + rowIndex)} className={cn(`${BLOCK_NAME}__row`)}>
              {columns.map((column) => (
                <td key={column.key} className={cn(`${BLOCK_NAME}__td`)}>
                  {column.renderCell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
