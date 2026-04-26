"use client"

import { useEffect, useRef, useState } from "react"

const PREFIX = "controlpdf:"

export function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStored<T>(key: string, value: T): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // quota exceeded or storage disabled — fail silently
  }
}

export function removeStored(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial)
  const hydrated = useRef(false)

  useEffect(() => {
    const stored = readStored<T | undefined>(key, undefined as T | undefined)
    if (stored !== undefined) setValue(stored as T)
    hydrated.current = true
  }, [key])

  useEffect(() => {
    if (!hydrated.current) return
    writeStored(key, value)
  }, [key, value])

  return [value, setValue]
}
