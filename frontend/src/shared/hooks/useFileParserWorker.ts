import { useRef, useCallback } from 'react'
import type { FileParserWorkerInbound, FileParserWorkerOutbound } from '@/shared/workers/file-parser.worker'

type ParseResult =
  | { ok: true; csv: string }
  | { ok: false; error: string }

/**
 * Хук для общения с file-parser воркером.
 * Воркер создаётся лениво при первом вызове parseFile и переиспользуется.
 * Для CSV-файлов воркер не используется — они читаются через File.text() на main thread.
 */
export function useFileParserWorker() {
  const workerRef = useRef<Worker | null>(null)

  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('@/shared/workers/file-parser.worker.ts', import.meta.url),
        { type: 'module' },
      )
    }
    return workerRef.current
  }, [])

  const parseFile = useCallback(async (file: File): Promise<ParseResult> => {
    const ext = file.name.split('.').pop()?.toLowerCase()

    // CSV-файлы обрабатываем на main thread — они не требуют распаковки
    if (ext === 'csv' || ext === 'txt' || !ext) {
      try {
        const csv = await file.text()
        return { ok: true, csv }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Не удалось прочитать файл.' }
      }
    }

    // XLSX/XLS — отправляем в воркер
    const isXlsx = ext === 'xlsx'
    const isXls = ext === 'xls'

    if (!isXlsx && !isXls) {
      // Неизвестное расширение — пробуем как текст
      try {
        const csv = await file.text()
        return { ok: true, csv }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Неизвестный формат файла.' }
      }
    }

    const buffer = await file.arrayBuffer()
    const worker = getWorker()

    return new Promise<ParseResult>((resolve) => {
      const messageType: FileParserWorkerInbound['type'] = isXlsx ? 'parse-xlsx' : 'parse-xls'
      const message: FileParserWorkerInbound = { type: messageType, buffer }

      const onMessage = (event: MessageEvent<FileParserWorkerOutbound>) => {
        worker.removeEventListener('message', onMessage)
        const data = event.data
        if (data.type === 'result') {
          resolve({ ok: true, csv: data.csv })
        } else {
          resolve({ ok: false, error: data.message })
        }
      }

      worker.addEventListener('message', onMessage)
      worker.postMessage(message, [buffer])
    })
  }, [getWorker])

  return { parseFile }
}
