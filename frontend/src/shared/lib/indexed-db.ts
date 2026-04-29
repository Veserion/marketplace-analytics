export type CsvStorageMode =
  | 'unitEconomics'
  | 'accrualReport'
  | 'ozonCogs'
  | 'wildberriesAccrualReport'
  | 'wildberriesForeignAccrualReport'
  | 'wildberriesCogs'

export type CsvStorageRecord = {
  mode: CsvStorageMode
  fileName: string
  csvText: string
  updatedAt: number
}

const DB_NAME = 'marketplace_analytics'
const STORE_NAME = 'csv_uploads'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this environment.'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'mode' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'))
  })
}

export async function saveCsvRecord(record: CsvStorageRecord): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save CSV record.'))
  })
  db.close()
}

export async function getCsvRecord(mode: CsvStorageMode): Promise<CsvStorageRecord | null> {
  const db = await openDb()
  const record = await new Promise<CsvStorageRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(mode)
    request.onsuccess = () => resolve((request.result as CsvStorageRecord | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Failed to read CSV record.'))
  })
  db.close()
  return record
}

export async function getCsvRecords(): Promise<CsvStorageRecord[]> {
  const db = await openDb()
  const records = await new Promise<CsvStorageRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result as CsvStorageRecord[] | undefined) ?? [])
    request.onerror = () => reject(request.error ?? new Error('Failed to read CSV records.'))
  })
  db.close()
  return records
}

export async function deleteCsvRecord(mode: CsvStorageMode): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(mode)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete CSV record.'))
  })
  db.close()
}

export async function clearCsvRecords(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear CSV records.'))
  })
  db.close()
}
