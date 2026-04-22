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
