import { useRef, DependencyList, useEffect, EffectCallback, useCallback, useState } from 'react'

export function useLatestRef<T>(latest: T) {
  const latestRef = useRef(latest)
  latestRef.current = latest
  return latestRef
}

export function useTimeout(ms: number, fn: EffectCallback, deps: DependencyList) {
  useEffect(() => {
    let callback: ReturnType<EffectCallback>
    const id = setTimeout(() => {
      callback = fn()
    }, ms)
    return () => {
      clearTimeout(id)
      callback?.()
    }
  }, [ms, ...deps])
}

export function usePrevious<T>(current: T) {
  const prev = useRef<T | undefined>(undefined)
  const cur = useRef<T>(current)
  if (cur.current !== current) {
    ;[prev.current, cur.current] = [cur.current, current]
  }
  return prev
}

export function useRedraw() {
  const [, setCount] = useState(0)
  return useCallback(() => setCount((x) => x + 1), [])
}
