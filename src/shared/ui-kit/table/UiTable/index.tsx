import { useCallback, useMemo, useState } from 'react'
import classNames from 'classnames/bind'
import Button from 'antd/es/button'
import Input from 'antd/es/input'
import Table from 'antd/es/table'
import type { ColumnsType as TableColumnsType } from 'antd/es/table'
import styles from './index.module.scss'

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

type TableRecord<T> = {
  __key: string
  __row: T
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

  const toggleSort = useCallback((columnKey: string): void => {
    const targetColumn = columns.find((column) => column.key === columnKey)
    if (!targetColumn?.sortable) return
    setSortState((prev) => {
      if (!prev || prev.key !== columnKey) return { key: columnKey, direction: 'asc' }
      return { key: columnKey, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
  }, [columns])

  const dataSource = useMemo<TableRecord<T>[]>(() => {
    const regularRows = preparedRows.map((row, rowIndex) => ({
      __key: rowKey(row, rowIndex),
      __row: row,
    }))
    const pinnedRowsData = pinnedRows.map((row, rowIndex) => ({
      __key: rowKey(row, preparedRows.length + rowIndex),
      __row: row,
    }))
    return [...regularRows, ...pinnedRowsData]
  }, [pinnedRows, preparedRows, rowKey])

  const tableColumns = useMemo<TableColumnsType<TableRecord<T>>>(() => (
    columns.map((column) => {
      const isSorted = sortState?.key === column.key
      const sortDirection = isSorted ? sortState.direction : null

      return {
        key: column.key,
        width: column.width,
        className: cn(`${BLOCK_NAME}__td`),
        onHeaderCell: () => ({ className: cn(`${BLOCK_NAME}__th`) }),
        title: (
          <div className={cn(`${BLOCK_NAME}__header`)}>
            <div className={cn(`${BLOCK_NAME}__head-cell`)}>
              <span className={cn(`${BLOCK_NAME}__title`)}>{column.title}</span>
              {column.sortable && (
                <Button
                  className={cn(`${BLOCK_NAME}__sort-button`)}
                  type="text"
                  aria-label="Сортировать по колонке"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    toggleSort(column.key)
                  }}
                >
                  {sortDirection === 'asc' ? '↑' : sortDirection === 'desc' ? '↓' : '↕'}
                </Button>
              )}
            </div>
            {showHeaderFilters && column.filterable && (
              <Input
                style={{ width: '100%' }}
                value={filters[column.key] ?? ''}
                placeholder={column.filterPlaceholder ?? 'Фильтр'}
                onChange={(event) => {
                  const value = event.target.value
                  setFilters((prev) => ({ ...prev, [column.key]: value }))
                }}
                onClick={(event) => event.stopPropagation()}
              />
            )}
          </div>
        ),
        render: (_, record) => column.renderCell(record.__row),
      }
    })
  ), [columns, filters, showHeaderFilters, sortState, toggleSort])

  return (
    <Table<TableRecord<T>>
      className={cn(BLOCK_NAME)}
      columns={tableColumns}
      dataSource={dataSource}
      rowKey="__key"
      pagination={false}
      tableLayout="fixed"
      locale={{ emptyText: <span className={cn(`${BLOCK_NAME}__empty`)}>{emptyText}</span> }}
      rowClassName={(_, index) => cn(`${BLOCK_NAME}__row`, { [`${BLOCK_NAME}__row--even`]: index % 2 === 1 })}
    />
  )
}
