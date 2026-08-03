// Validation for external document links (Google Drive, Dropbox, CalTopo…)
// attached alongside file uploads on courses and tasks.

const MAX_URL_LENGTH = 2000

export function normalizeDocLink(rawUrl: string, rawTitle: string): { url: string; filename: string } {
  const url = rawUrl.trim()
  if (!url) throw new Error('Paste a link first')
  if (url.length > MAX_URL_LENGTH) throw new Error('That link is too long')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('That doesn’t look like a valid link — it should start with https://')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Links must start with http:// or https://')
  }
  const filename = rawTitle.trim().slice(0, 200) || parsed.hostname.replace(/^www\./, '')
  return { url, filename }
}
