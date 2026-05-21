import * as cheerio from 'cheerio'

export interface ScrapedPage {
  title: string
  content: string
  description: string
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
    // Plain text / markdown URL
    const text = await response.text()
    return { title: url, content: text, description: '' }
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  // Extract title
  const title = $('title').first().text().trim()
    || $('h1').first().text().trim()
    || url

  // Extract meta description
  const description = $('meta[name="description"]').attr('content') || ''

  // Remove noise elements
  $('script, style, nav, header, footer, aside, .nav, .navbar, .sidebar, .footer, .header, .menu, .cookie, .advertisement, .ad, .ads, [aria-hidden="true"]').remove()

  // Try to get main content in order of preference
  let content = ''
  const selectors = ['main', 'article', '[role="main"]', '.content', '.post', '.article', '#content', '#main', 'body']

  for (const sel of selectors) {
    const el = $(sel)
    if (el.length) {
      content = el.text()
      break
    }
  }

  // Clean up whitespace
  content = content
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!content || content.length < 100) {
    content = $('body').text().replace(/\s+/g, ' ').trim()
  }

  return { title, content, description }
}
