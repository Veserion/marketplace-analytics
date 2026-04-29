const XLSX_EXTENSION_PATTERN = /\.xlsx$/i
const XLS_EXTENSION_PATTERN = /\.xls$/i

function isXlsxFile(file: File): boolean {
  return XLSX_EXTENSION_PATTERN.test(file.name)
}

function isXlsFile(file: File): boolean {
  return XLS_EXTENSION_PATTERN.test(file.name)
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function getColumnIndexFromRef(cellRef: string): number {
  let col = 0
  for (let i = 0; i < cellRef.length; i += 1) {
    const code = cellRef.charCodeAt(i)
    if (code >= 65 && code <= 90) {
      col = col * 26 + (code - 64)
      continue
    }
    if (code >= 97 && code <= 122) {
      col = col * 26 + (code - 96)
      continue
    }
    break
  }
  return Math.max(0, col - 1)
}

function escapeCsvCell(value: string): string {
  if (!/[;"\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function decodeNamedEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractText(node: unknown): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return decodeNamedEntities(String(node))
  }
  if (Array.isArray(node)) {
    return node.map((item) => extractText(item)).join('')
  }
  if (typeof node !== 'object') return ''

  const obj = node as Record<string, unknown>
  if (typeof obj.t === 'string') return obj.t
  if (obj.t !== undefined) return extractText(obj.t)
  if (obj.r !== undefined) return extractText(obj.r)
  if (obj.text !== undefined) return extractText(obj.text)
  if (obj['#text'] !== undefined) return extractText(obj['#text'])
  return ''
}

type XmlParser = {
  parse: (input: string) => unknown
}

function resolveFirstSheetPath(workbook: unknown, rels: unknown): string {
  const workbookObj = workbook as Record<string, unknown>
  const sheetsNode = workbookObj.workbook
    && typeof workbookObj.workbook === 'object'
    ? (workbookObj.workbook as Record<string, unknown>).sheets
    : undefined
  const firstSheet = toArray(
    sheetsNode && typeof sheetsNode === 'object'
      ? (sheetsNode as Record<string, unknown>).sheet as Record<string, unknown> | Record<string, unknown>[] | undefined
      : undefined,
  )[0]
  if (!firstSheet || typeof firstSheet !== 'object') {
    throw new Error('Excel файл не содержит листов.')
  }

  const relId = String(
    (firstSheet as Record<string, unknown>).id
    ?? (firstSheet as Record<string, unknown>)['r:id']
    ?? '',
  )
  if (!relId) {
    throw new Error('Не удалось определить ссылку на лист в Excel файле.')
  }

  const relsObj = rels as Record<string, unknown>
  const relationshipNodes = relsObj.Relationships
    && typeof relsObj.Relationships === 'object'
    ? toArray((relsObj.Relationships as Record<string, unknown>).Relationship as Record<string, unknown> | Record<string, unknown>[] | undefined)
    : []
  const sheetRel = relationshipNodes.find((rel) => String((rel as Record<string, unknown>).Id ?? '') === relId)
  if (!sheetRel || typeof sheetRel !== 'object') {
    throw new Error('Не удалось найти описание первого листа в Excel файле.')
  }

  const rawTarget = String((sheetRel as Record<string, unknown>).Target ?? '')
  if (!rawTarget) {
    throw new Error('Не удалось определить путь к первому листу в Excel файле.')
  }

  if (rawTarget.startsWith('/')) return rawTarget.slice(1)
  return `xl/${rawTarget.replace(/^\.?\//, '')}`
}

async function convertXlsxToCsv(file: File): Promise<string> {
  const [{ unzipSync, strFromU8 }, { XMLParser }] = await Promise.all([
    import('fflate'),
    import('fast-xml-parser'),
  ])

  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const parser: XmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
    trimValues: false,
    processEntities: false,
  })

  const decodeNumericEntities = (xml: string): string => xml
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num: string) => String.fromCodePoint(Number.parseInt(num, 10)))

  const readXml = (path: string): unknown => {
    const fileBytes = zip[path]
    if (!fileBytes) throw new Error(`Не найден XML файл: ${path}`)
    return parser.parse(decodeNumericEntities(strFromU8(fileBytes)))
  }

  const workbookXml = readXml('xl/workbook.xml')
  const workbookRelsXml = readXml('xl/_rels/workbook.xml.rels')
  const sheetPath = resolveFirstSheetPath(workbookXml, workbookRelsXml)
  const sheetXml = readXml(sheetPath)

  const sharedStrings: string[] = []
  if (zip['xl/sharedStrings.xml']) {
    const sharedStringsXml = readXml('xl/sharedStrings.xml') as Record<string, unknown>
    const siNodes = sharedStringsXml.sst && typeof sharedStringsXml.sst === 'object'
      ? toArray((sharedStringsXml.sst as Record<string, unknown>).si as unknown[] | unknown)
      : []
    for (const si of siNodes) {
      sharedStrings.push(extractText(si))
    }
  }

  const worksheet = (sheetXml as Record<string, unknown>).worksheet
  if (!worksheet || typeof worksheet !== 'object') {
    throw new Error('Не удалось прочитать данные первого листа Excel файла.')
  }

  const sheetData = (worksheet as Record<string, unknown>).sheetData
  const rowNodes = sheetData && typeof sheetData === 'object'
    ? toArray((sheetData as Record<string, unknown>).row as Record<string, unknown> | Record<string, unknown>[] | undefined)
    : []

  const rowsByIndex = new Map<number, string[]>()
  for (const rowNode of rowNodes) {
    const rowObj = rowNode as Record<string, unknown>
    const rowIndex = Number(rowObj.r ?? Number.NaN)
    const targetIndex = Number.isFinite(rowIndex) ? rowIndex - 1 : rowsByIndex.size
    const rowCells = toArray(rowObj.c as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const values = rowsByIndex.get(targetIndex) ?? []

    let nextCol = 0
    for (const cellNode of rowCells) {
      const cell = cellNode as Record<string, unknown>
      const ref = String(cell.r ?? '')
      const colIndex = ref ? getColumnIndexFromRef(ref) : nextCol
      nextCol = colIndex + 1

      const cellType = String(cell.t ?? '')
      let value = ''
      if (cellType === 's') {
        const idx = Number(extractText(cell.v))
        value = Number.isFinite(idx) ? (sharedStrings[idx] ?? '') : ''
      } else if (cellType === 'inlineStr') {
        value = extractText(cell.is)
      } else if (cellType === 'str') {
        value = extractText(cell.v)
      } else if (cell.v !== undefined) {
        value = extractText(cell.v)
      }

      values[colIndex] = value
    }

    rowsByIndex.set(targetIndex, values)
  }

  const sortedRowIndexes = [...rowsByIndex.keys()].sort((a, b) => a - b)
  const csvLines: string[] = []
  for (const rowIndex of sortedRowIndexes) {
    const row = rowsByIndex.get(rowIndex) ?? []
    const lastNonEmptyIndex = row.reduce((acc, cell, index) => (cell && cell !== '' ? index : acc), -1)
    if (lastNonEmptyIndex === -1) continue
    const trimmed = row.slice(0, lastNonEmptyIndex + 1)
    csvLines.push(trimmed.map((cell) => escapeCsvCell(cell ?? '')).join(';'))
  }

  return csvLines.join('\n')
}

async function convertXlsToCsv(file: File): Promise<string> {
  const { read, utils } = await import('xlsx')
  const workbook = read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Excel файл не содержит листов.')
  const sheet = workbook.Sheets[sheetName]
  return utils.sheet_to_csv(sheet, {
    FS: ';',
    RS: '\n',
    strip: true,
    blankrows: false,
  })
}

export async function readUploadFileAsCsv(file: File): Promise<string> {
  if (isXlsxFile(file)) {
    return convertXlsxToCsv(file)
  }
  if (isXlsFile(file)) {
    return convertXlsToCsv(file)
  }
  return file.text()
}
