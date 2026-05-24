// Parses various document formats into plain text

export async function parsePDF(buffer: Buffer): Promise<string> {
  // pdf-parse v1 uses pdfjs-dist v2 which has no DOMMatrix/browser-API dependency
  // v2 of pdf-parse requires pdfjs-dist v5 which breaks on Vercel's Node.js 18/20 runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const result = await pdfParse(buffer)
  return result.text
}

export async function parseDOCX(buffer: Buffer): Promise<string> {
  const mod = await import('mammoth')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (mod as any).default ?? mod
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export function parseCSV(text: string): string {
  // Convert CSV to readable prose for embedding
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length === 0) return text
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
    return headers.map((h, i) => `${h}: ${values[i] || ''}`).join(', ')
  })
  return rows.join('\n')
}

export async function parseFile(buffer: Buffer, fileType: string): Promise<string> {
  const type = fileType.toLowerCase()

  if (type === 'pdf') return parsePDF(buffer)
  if (type === 'docx' || type === 'doc') return parseDOCX(buffer)
  if (type === 'csv') return parseCSV(buffer.toString('utf-8'))
  if (['txt', 'md', 'markdown', 'text'].includes(type)) return buffer.toString('utf-8')

  return buffer.toString('utf-8')
}

export function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'txt'
  return ext
}
