// Semantic-boundary chunker: splits on sentences/paragraphs, respects token limits
// 300 tokens per chunk, 20 token overlap — well within nomic-embed-text's 8192-token context
const CHUNK_SIZE = 300
const CHUNK_OVERLAP = 20

// Rough token estimate: 1 token ≈ 4 chars (cl100k_base approximation)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries, keeping delimiter attached
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

export interface TextChunk {
  content: string
  chunkIndex: number
  tokenCount: number
}

export function chunkText(text: string): TextChunk[] {
  const paragraphs = splitIntoParagraphs(text)
  const chunks: TextChunk[] = []
  let current = ''
  let currentTokens = 0
  let chunkIndex = 0

  // Overlap buffer: last N tokens of previous chunk
  let overlapText = ''

  for (const paragraph of paragraphs) {
    const paraTokens = estimateTokens(paragraph)

    // If this paragraph alone exceeds chunk size, split it by sentences
    if (paraTokens > CHUNK_SIZE) {
      if (current.trim()) {
        chunks.push({
          content: (overlapText + ' ' + current).trim(),
          chunkIndex: chunkIndex++,
          tokenCount: estimateTokens((overlapText + ' ' + current).trim()),
        })
        overlapText = extractOverlap(current)
        current = ''
        currentTokens = 0
      }

      const sentences = splitIntoSentences(paragraph)
      for (const sentence of sentences) {
        const sentTokens = estimateTokens(sentence)
        if (currentTokens + sentTokens > CHUNK_SIZE && current.trim()) {
          chunks.push({
            content: (overlapText + ' ' + current).trim(),
            chunkIndex: chunkIndex++,
            tokenCount: estimateTokens((overlapText + ' ' + current).trim()),
          })
          overlapText = extractOverlap(current)
          current = sentence
          currentTokens = sentTokens
        } else {
          current += (current ? ' ' : '') + sentence
          currentTokens += sentTokens
        }
      }
    } else if (currentTokens + paraTokens > CHUNK_SIZE && current.trim()) {
      chunks.push({
        content: (overlapText + ' ' + current).trim(),
        chunkIndex: chunkIndex++,
        tokenCount: estimateTokens((overlapText + ' ' + current).trim()),
      })
      overlapText = extractOverlap(current)
      current = paragraph
      currentTokens = paraTokens
    } else {
      current += (current ? '\n\n' : '') + paragraph
      currentTokens += paraTokens
    }
  }

  if (current.trim()) {
    chunks.push({
      content: (overlapText + ' ' + current).trim(),
      chunkIndex: chunkIndex++,
      tokenCount: estimateTokens((overlapText + ' ' + current).trim()),
    })
  }

  return chunks
}

function extractOverlap(text: string): string {
  // Take the last ~CHUNK_OVERLAP tokens worth of text as overlap context
  const targetChars = CHUNK_OVERLAP * 4
  if (text.length <= targetChars) return text
  // Find a word boundary near the target position from the end
  const start = text.length - targetChars
  const wordBoundary = text.indexOf(' ', start)
  return wordBoundary !== -1 ? text.slice(wordBoundary + 1) : text.slice(start)
}
