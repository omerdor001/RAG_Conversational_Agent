// Parses various document formats into plain text

export async function parsePDF(buffer: Buffer): Promise<string> {
  // pdf-parse ESM export doesn't have .default; use named import
  const mod = await import('pdf-parse')
  const pdfParse = (mod as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default ?? mod
  const result = await (pdfParse as (b: Buffer) => Promise<{ text: string }>)(buffer)
  return result.text
}

export async function parseDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
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

export async function parseFile(
  buffer: Buffer,
  fileType: string,
  rawText?: string
): Promise<string> {
  const type = fileType.toLowerCase()

  if (type === 'pdf') return parsePDF(buffer)
  if (type === 'docx' || type === 'doc') return parseDOCX(buffer)
  if (type === 'csv') return parseCSV(buffer.toString('utf-8'))
  if (['txt', 'md', 'markdown', 'text'].includes(type)) return buffer.toString('utf-8')

  // Fallback: try UTF-8 decode
  return rawText || buffer.toString('utf-8')
}

export function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'txt'
  return ext
}
