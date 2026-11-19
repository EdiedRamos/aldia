// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import {
  parseSafeDownloadUrl,
  triggerSafeFileDownload,
} from '@/lib/utils/safe-download'

describe('lib/utils/safe-download', () => {
  it('accepts same-origin blob: URLs and triggers anchor download cleanly', () => {
    const sameOriginBlobUrl = `blob:${window.location.origin}/1234-5678-abcd`
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    const appendSpy = vi.spyOn(document.body, 'appendChild')

    triggerSafeFileDownload(sameOriginBlobUrl, 'comprobante-2026-11.jpg')

    expect(appendSpy).toHaveBeenCalledTimes(1)
    const anchor = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement
    expect(anchor.tagName).toBe('A')
    expect(anchor.href).toBe(sameOriginBlobUrl)
    expect(anchor.download).toBe('comprobante-2026-11.jpg')
    expect(anchor.rel).toBe('noopener noreferrer')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(document.body.contains(anchor)).toBe(false)

    clickSpy.mockRestore()
    appendSpy.mockRestore()
  })

  it('accepts valid https: URLs', () => {
    const httpsUrl = 'https://storage.googleapis.com/bucket/receipt.pdf?sig=1'
    const parsed = parseSafeDownloadUrl(httpsUrl)
    expect(parsed?.toString()).toBe(httpsUrl)
  })

  it('rejects unsafe schemes (javascript:, data:, http:) and cross-origin blob: URLs', () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    expect(() =>
      triggerSafeFileDownload('javascript:alert(1)', 'malicious.js')
    ).toThrow('Unsafe or invalid download URL')

    expect(() =>
      triggerSafeFileDownload(
        'data:text/html,<script>alert(1)</script>',
        'xss.html'
      )
    ).toThrow('Unsafe or invalid download URL')

    expect(() =>
      triggerSafeFileDownload('http://insecure.example.com/file.jpg', 'f.jpg')
    ).toThrow('Unsafe or invalid download URL')

    expect(() =>
      triggerSafeFileDownload(
        'blob:https://evil.example.com/1234-5678',
        'evil.jpg'
      )
    ).toThrow('Unsafe or invalid download URL')

    expect(clickSpy).not.toHaveBeenCalled()
    clickSpy.mockRestore()
  })
})
