/**
 * Parses and validates that a URL uses an explicitly allowed safe protocol:
 * - `blob:` originating from the current `window.location.origin`
 * - `https:` for signed or remote resources
 */
export function parseSafeDownloadUrl(rawUrl: string | null): URL | null {
  if (!rawUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(rawUrl)

    if (parsedUrl.protocol === 'blob:') {
      if (
        typeof window !== 'undefined' &&
        parsedUrl.origin !== window.location.origin
      ) {
        return null
      }
      return parsedUrl
    }

    if (parsedUrl.protocol === 'https:') {
      return parsedUrl
    }

    return null
  } catch {
    return null
  }
}

/**
 * Safely triggers a browser file download after validating the target URL structure and protocol.
 * Throws an error if the URL scheme is unsafe (e.g., `javascript:`, `data:`, `http:`) or cross-origin `blob:`.
 */
export function triggerSafeFileDownload(
  rawUrl: string,
  fileName: string
): void {
  const parsedUrl = parseSafeDownloadUrl(rawUrl)

  if (!parsedUrl) {
    throw new Error('Unsafe or invalid download URL')
  }

  const anchor = document.createElement('a')
  anchor.href = parsedUrl.toString()
  anchor.download = fileName
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
