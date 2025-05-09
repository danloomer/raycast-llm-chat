import { useRef, DependencyList, useEffect, EffectCallback } from 'react'

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
