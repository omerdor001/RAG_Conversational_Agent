import * as cheerio from 'cheerio'

export interface ScrapedPage {
  title: string
  content: string
  description: string
}

// Minimum characters to consider a scrape successful.
// Below this we assume the page is JS-rendered and needs the Jina fallback.
const MIN_CONTENT_LENGTH = 200

async function scrapeWithJina(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`
  const headers: Record<string, string> = {
    'Accept': 'text/plain',
    'X-Return-Format': 'text',
  }
  const apiKey = process.env.JINA_API_KEY
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const response = await fetch(jinaUrl, {
    headers,
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error(`Jina Reader returned ${response.status}`)
  return (await response.text()).trim()
}

export async function scrapeURL(url: string): Promise<ScrapedPage> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RAGBot/1.0; +https://github.com/ragagent)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    const text = await response.text()
    return { title: url, content: text, description: '' }
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  const title = $('title').first().text().trim()
    || $('h1').first().text().trim()
    || url

  const description = $('meta[name="description"]').attr('content') || ''

  $('script, style, nav, header, footer, aside, .nav, .navbar, .sidebar, .footer, .header, .menu, .cookie, .advertisement, .ad, .ads, [aria-hidden="true"]').remove()

  let content = ''
  const selectors = ['main', 'article', '[role="main"]', '.content', '.post', '.article', '#content', '#main', 'body']
  for (const sel of selectors) {
    const el = $(sel)
    if (el.length) {
      content = el.text()
      break
    }
  }

  content = content
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!content || content.length < 100) {
    content = $('body').text().replace(/\s+/g, ' ').trim()
  }

  // JS-rendered SPA (e.g. React/Next.js apps): the static HTML has no real text.
  // Fall back to Jina Reader which renders the page server-side and returns clean text.
  if (content.length < MIN_CONTENT_LENGTH) {
    try {
      const jinaContent = await scrapeWithJina(url)
      if (jinaContent.length > content.length) {
        return { title, content: jinaContent, description }
      }
    } catch (err) {
      console.warn(`Jina Reader fallback failed for ${url}:`, err)
    }

    if (content.length < 50) {
      throw new Error(
        'Could not extract meaningful content from this URL. ' +
        'The page appears to require JavaScript rendering. ' +
        'Try linking to a specific documentation or article page, or paste the text content directly.'
      )
    }
  }

  return { title, content, description }
}
