import { useCallback, useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 1000
export function useDebouncedCallback<T>(value: T, onChange: ((value: T) => void) | undefined, delay = DEBOUNCE_MS): [T, (v: T) => void] {
  const [local, setLocal] = useState<T>(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => { setLocal(value) }, [value])

  const set = useCallback((v: T) => {
    setLocal(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange?.(v), delay)
  }, [onChange, delay])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return [local, set]
}