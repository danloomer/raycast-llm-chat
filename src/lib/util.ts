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
