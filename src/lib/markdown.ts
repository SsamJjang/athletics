import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

/**
 * Admin-written Markdown → safe HTML. Admins are trusted, but it's still
 * user input going into innerHTML, so it's sanitized on the way out.
 */
export function renderMarkdown(source: string | null | undefined) {
  const raw = marked.parse(source ?? '', { async: false })
  return DOMPurify.sanitize(raw, {
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  })
}

export function plainText(source: string | null | undefined, limit = 180) {
  const text = renderMarkdown(source)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

// Links in admin content open in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.startsWith('http')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})
