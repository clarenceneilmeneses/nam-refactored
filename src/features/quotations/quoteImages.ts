/**
 * Image persistence for the Formal Quotation document.
 * Legacy behaviour: data-URLs cached in localStorage under
 * `cache_img_{itemName}` (item photos) and `cache_img_sig_1` / `cache_img_sig_2`
 * (e-signatures), so re-printing the same item recalls its photo and the
 * signatures auto-load on every future quote.
 */

export const SIGNATURE_KEYS = ['cache_img_sig_1', 'cache_img_sig_2'] as const

/**
 * Signatory block under the e-signature: name + position. Device-local like
 * the signature image itself (it's the same person's), so each user types
 * their own once and it sticks. The legacy hardcoded values remain the
 * defaults until first edited.
 */
export const SIGNER_KEYS = { name: 'cache_sig_name_1', title: 'cache_sig_title_1' } as const
export const SIGNER_DEFAULTS = { name: 'ALLYSON ASHLEY AGUILERA', title: 'Sales and Technical Officer' } as const

export function loadCachedText(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveCachedText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // localStorage unavailable/full — the doc still prints, it just won't recall.
  }
}

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
