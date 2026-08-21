export function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveKey(url: string | undefined, title: string | undefined): string {
  if (url !== undefined && url !== '') {
    try {
      const parsed = new URL(url)
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '')
    } catch {
      // not a valid URL — fall through to the title
    }
  }
  if (title !== undefined && title !== '') return slug(title)
  throw new Error('cannot derive record key: no url and no title')
}
