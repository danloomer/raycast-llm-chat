/**
 * Formats a Unix timestamp (in milliseconds) into a 'HH:mm' string.
 * @param timestamp - The Unix timestamp in milliseconds.
 * @returns The formatted time string (e.g., '14:32').
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

export function throttle<A extends any[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timeoutId: NodeJS.Timeout | null = null
  let lastArgs: A | null = null
  let trailingCallScheduled = false

  const throttledFn = (...args: A) => {
    lastArgs = args

    if (!timeoutId) {
      fn(...args)
      timeoutId = setTimeout(() => {
        timeoutId = null
        if (trailingCallScheduled) {
          trailingCallScheduled = false
          throttledFn(...lastArgs!) // Use lastArgs for the trailing call
        }
      }, ms)
    } else {
      trailingCallScheduled = true
    }
  }

  return throttledFn
}

/**
 * Converts a base64 string and MIME type to a markdown image string
 * @param {string} base64String - The base64 encoded image data (without the data URL prefix)
 * @param {string} mimeType - The MIME type of the image (e.g., 'image/png', 'image/jpeg')
 * @returns {string} - A markdown formatted image string
 */
export function base64ToMarkdownImage(base64String: string, mimeType: string): string {
  // Make sure the base64 string doesn't already include the data URL prefix
  if (base64String.startsWith('data:')) {
    throw new Error('Base64 string should not include the data URL prefix')
  }

  // Create the complete data URL
  const dataUrl = `data:${mimeType};base64,${base64String}`

  // Create the markdown image syntax
  const markdownImage = `![Image](${dataUrl})`

  return markdownImage
}

export function memo<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>()

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args)

    if (cache.has(key)) {
      return cache.get(key)!
    }

    const result = fn(...args)
    cache.set(key, result)
    return result
  }) as T
}

export const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))
