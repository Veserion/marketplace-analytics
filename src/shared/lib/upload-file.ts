const EXCEL_EXTENSION_PATTERN = /\.(xlsx|xls)$/i

function isExcelFile(file: File): boolean {
  return EXCEL_EXTENSION_PATTERN.test(file.name)
}

async function convertExcelToCsv(file: File): Promise<string> {
  const { read, utils } = await import('xlsx')
  const workbook = read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Excel файл не содержит листов.')
  }

  const sheet = workbook.Sheets[sheetName]
  return utils.sheet_to_csv(sheet, {
    FS: ';',
    RS: '\n',
    strip: true,
    blankrows: false,
  })
}

export async function readUploadFileAsCsv(file: File): Promise<string> {
  if (isExcelFile(file)) {
    return convertExcelToCsv(file)
  }
  return file.text()
}
