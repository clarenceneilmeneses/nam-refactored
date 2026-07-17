/**
 * Image persistence for the Formal Quotation document.
 * Legacy behaviour: data-URLs cached in localStorage under
 * `cache_img_{itemName}` (item photos) and `cache_img_sig_1` / `cache_img_sig_2`
 * (e-signatures), so re-printing the same item recalls its photo and the
 * signatures auto-load on every future quote.
 */

export const SIGNATURE_KEYS = ['cache_img_sig_1', 'cache_img_sig_2'] as const

/**
 * Signatory block under the e-signature. It lives on the user's account
 * (users.quote_signer_*, 17_signer_profile.sql) so it follows the login
 * across devices; these legacy values are the last-resort defaults for an
 * account with no saved signer and no display name.
 */
export const SIGNER_DEFAULTS = { name: 'ALLYSON ASHLEY AGUILERA', title: 'Sales and Technical Officer' } as const

/** Legacy key sanitisation: collapse anything non-alphanumeric to "_". */
export function itemImageKey(itemName: string): string {
  return `cache_img_${itemName.trim().replace(/[^a-zA-Z0-9]+/g, '_')}`
}

export function loadCachedImage(key: string): string | null {
  try {
    const value = localStorage.getItem(key)
    return value && value.startsWith('data:image') ? value : null
  } catch {
    return null
  }
}

/** Returns false when the cache write failed (e.g. localStorage quota). */
export function saveCachedImage(key: string, dataUrl: string): boolean {
  try {
    localStorage.setItem(key, dataUrl)
    return true
  } catch {
    return false
  }
}

/**
 * Reads an image file as a data URL, downscaling anything larger than
 * `maxDim` px so the cache stays within localStorage limits. Falls back to
 * the raw data URL if decoding fails (e.g. unsupported format).
 */
export function fileToDataUrl(file: File, maxDim = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected file'))
    reader.onload = () => {
      const raw = reader.result as string
      const img = new Image()
      img.onerror = () => resolve(raw)
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        if (scale >= 1) {
          resolve(raw)
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(raw)
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        // Keep PNG for transparency (signatures); JPEG for everything else.
        resolve(file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = raw
    }
    reader.readAsDataURL(file)
  })
}
