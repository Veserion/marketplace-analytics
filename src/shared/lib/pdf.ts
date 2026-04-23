import { jsPDF } from 'jspdf'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return window.btoa(binary)
}

export async function configurePdfFont(doc: jsPDF): Promise<void> {
  const response = await fetch('/fonts/Arial.ttf')
  if (!response.ok) return
  const buffer = await response.arrayBuffer()
  const base64 = toBase64(new Uint8Array(buffer))
  doc.addFileToVFS('Arial.ttf', base64)
  doc.addFont('Arial.ttf', 'ArialCustom', 'normal')
  doc.setFont('ArialCustom')
}

type Rgb = readonly [number, number, number]

type PdfTheme = {
  headerBg: Rgb
  sectionBg: Rgb
  sectionText: Rgb
  cardBg: Rgb
  cardBorder: Rgb
  textPrimary: Rgb
  textMuted: Rgb
  textPositive: Rgb
  textNegative: Rgb
  textWarning: Rgb
}

export const PDF_THEMES = {
  ozonUnit: {
    headerBg: [8, 46, 92],
    sectionBg: [18, 73, 135],
    sectionText: [255, 255, 255],
    cardBg: [255, 255, 255],
    cardBorder: [215, 224, 236],
    textPrimary: [22, 41, 67],
    textMuted: [90, 109, 132],
    textPositive: [31, 139, 76],
    textNegative: [198, 40, 40],
    textWarning: [138, 100, 0],
  } satisfies PdfTheme,
  ozonAccrual: {
    headerBg: [12, 57, 101],
    sectionBg: [33, 85, 140],
    sectionText: [255, 255, 255],
    cardBg: [255, 255, 255],
    cardBorder: [214, 222, 236],
    textPrimary: [20, 34, 56],
    textMuted: [84, 105, 129],
    textPositive: [31, 139, 76],
    textNegative: [198, 40, 40],
    textWarning: [138, 100, 0],
  } satisfies PdfTheme,
  wildberries: {
    headerBg: [76, 44, 114],
    sectionBg: [92, 50, 131],
    sectionText: [255, 255, 255],
    cardBg: [255, 255, 255],
    cardBorder: [226, 213, 239],
    textPrimary: [58, 37, 84],
    textMuted: [107, 83, 130],
    textPositive: [46, 141, 88],
    textNegative: [198, 40, 40],
    textWarning: [138, 100, 0],
  } satisfies PdfTheme,
} as const

export type PdfMetricTone = 'default' | 'muted' | 'positive' | 'negative' | 'warning'

export type PdfMetricRow = {
  label: string
  value: string
  extra?: string | null
  tone?: PdfMetricTone
  labelMuted?: boolean
}

export type PdfSection = {
  title: string
  subtitle?: string
  rows: PdfMetricRow[]
}

type RenderPdfReportParams = {
  doc: jsPDF
  theme: PdfTheme
  title: string
  subtitle: string
  source: string
  sections: PdfSection[]
}

function setRgb(doc: jsPDF, rgb: Rgb, target: 'text' | 'fill' | 'draw'): void {
  if (target === 'text') {
    doc.setTextColor(rgb[0], rgb[1], rgb[2])
    return
  }
  if (target === 'fill') {
    doc.setFillColor(rgb[0], rgb[1], rgb[2])
    return
  }
  doc.setDrawColor(rgb[0], rgb[1], rgb[2])
}

function getToneColor(theme: PdfTheme, tone: PdfMetricTone): Rgb {
  if (tone === 'positive') return theme.textPositive
  if (tone === 'negative') return theme.textNegative
  if (tone === 'warning') return theme.textWarning
  if (tone === 'muted') return theme.textMuted
  return theme.textPrimary
}

export function renderPdfReport({
  doc,
  theme,
  title,
  subtitle,
  source,
  sections,
}: RenderPdfReportParams): void {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const labelWidth = contentWidth * 0.55
  const valueWidth = contentWidth - labelWidth - 8
  let y = margin

  const ensureSpace = (height: number): void => {
    if (y + height <= pageHeight - margin) return
    doc.addPage()
    doc.setFont('ArialCustom')
    y = margin
  }

  ensureSpace(30)
  setRgb(doc, theme.headerBg, 'fill')
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F')
  setRgb(doc, [255, 255, 255], 'text')
  doc.setFontSize(14)
  doc.text(title, margin + 4, y + 7)
  doc.setFontSize(9)
  doc.text(subtitle, margin + 4, y + 12)
  doc.text(`Источник: ${source || '—'}`, margin + 4, y + 17)
  y += 27

  for (const section of sections) {
    ensureSpace(16)
    setRgb(doc, theme.sectionBg, 'fill')
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F')
    setRgb(doc, theme.sectionText, 'text')
    doc.setFontSize(11)
    doc.text(section.title, margin + 4, y + 7)
    if (section.subtitle) {
      doc.setFontSize(9)
      doc.text(section.subtitle, margin + 4, y + 10.5)
    }
    y += 15

    for (const row of section.rows) {
      const labelLines = doc.splitTextToSize(row.label, labelWidth)
      const valueLines = doc.splitTextToSize(row.value, valueWidth)
      const extraLines = row.extra ? doc.splitTextToSize(row.extra, valueWidth) : []
      const rowLinesCount = Math.max(labelLines.length, valueLines.length + extraLines.length)
      const rowHeight = Math.max(10, rowLinesCount * 4 + 4)
      ensureSpace(rowHeight + 2)

      setRgb(doc, theme.cardBg, 'fill')
      setRgb(doc, theme.cardBorder, 'draw')
      doc.roundedRect(margin, y, contentWidth, rowHeight, 1.5, 1.5, 'FD')

      doc.setFontSize(9)
      setRgb(doc, row.labelMuted ? theme.textMuted : theme.textPrimary, 'text')
      doc.text(labelLines, margin + 3, y + 5)

      setRgb(doc, getToneColor(theme, row.tone ?? 'default'), 'text')
      doc.text(valueLines, margin + 5 + labelWidth, y + 5)
      if (extraLines.length > 0) {
        setRgb(doc, theme.textMuted, 'text')
        doc.text(extraLines, margin + 5 + labelWidth, y + 5 + valueLines.length * 4)
      }
      y += rowHeight + 2
    }

    y += 4
  }
}
