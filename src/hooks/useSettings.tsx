import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTheme } from '@/hooks/useTheme'

/** A selectable brand accent. Each preset carries light + dark variants so the
 *  chosen colour reads correctly in both themes (soft backgrounds especially). */
export type AccentKey = 'blue' | 'green' | 'purple' | 'red' | 'orange'

type AccentPreset = {
  key: AccentKey
  label: string
  /** Swatch shown in the picker (the light-mode accent). */
  swatch: string
  light: { accent: string; strong: string; soft: string }
  dark: { accent: string; strong: string; soft: string }
}

export const ACCENTS: AccentPreset[] = [
  {
    key: 'blue',
    label: 'Blue',
    swatch: '#1a73e8',
    light: { accent: '#1a73e8', strong: '#1557b0', soft: '#e8f0fe' },
    dark: { accent: '#8ab4f8', strong: '#aecbfa', soft: '#283b52' },
  },
  {
    key: 'green',
    label: 'Green',
    swatch: '#188038',
    light: { accent: '#188038', strong: '#0d652d', soft: '#e6f4ea' },
    dark: { accent: '#81c995', strong: '#a8dab5', soft: '#1e3a29' },
  },
  {
    key: 'purple',
    label: 'Purple',
    swatch: '#8430ce',
    light: { accent: '#8430ce', strong: '#681da8', soft: '#f3e8fd' },
    dark: { accent: '#c58af9', strong: '#d7b3fb', soft: '#3a2a52' },
  },
  {
    key: 'red',
    label: 'Red',
    swatch: '#d93025',
    light: { accent: '#d93025', strong: '#a50e0e', soft: '#fce8e6' },
    dark: { accent: '#f28b82', strong: '#f6aea9', soft: '#4a2420' },
  },
  {
    key: 'orange',
    label: 'Orange',
    swatch: '#e8710a',
    light: { accent: '#e8710a', strong: '#c25e00', soft: '#feefe3' },
    dark: { accent: '#fcad70', strong: '#fdc999', soft: '#4a3115' },
  },
]

type SettingsContextValue = {
  accent: AccentKey
  setAccent: (key: AccentKey) => void
  clock24: boolean
  setClock24: (on: boolean) => void
  startCollapsed: boolean
  setStartCollapsed: (on: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

const KEY_ACCENT = 'nam-accent'
const KEY_CLOCK24 = 'nam-clock24'
const KEY_COLLAPSED = 'nam-start-collapsed'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  return allowed.includes(v as T) ? (v as T) : fallback
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme()
  const [accent, setAccentState] = useState<AccentKey>(() =>
    readStored(KEY_ACCENT, ACCENTS.map((a) => a.key), 'blue'),
  )
  const [clock24, setClock24State] = useState<boolean>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_CLOCK24) : null) === 'true',
  )
  const [startCollapsed, setStartCollapsedState] = useState<boolean>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_COLLAPSED) : null) === 'true',
  )

  // Apply the accent as inline CSS-var overrides on <html>. Recomputed on theme
  // change so the soft background matches the active light/dark palette.
  useEffect(() => {
    const preset = ACCENTS.find((a) => a.key === accent) ?? ACCENTS[0]
    const v = resolved === 'dark' ? preset.dark : preset.light
    const root = document.documentElement.style
    root.setProperty('--color-accent', v.accent)
    root.setProperty('--color-accent-strong', v.strong)
    root.setProperty('--color-accent-soft', v.soft)
  }, [accent, resolved])

  const setAccent = (key: AccentKey) => {
    localStorage.setItem(KEY_ACCENT, key)
    setAccentState(key)
  }
  const setClock24 = (on: boolean) => {
    localStorage.setItem(KEY_CLOCK24, String(on))
    setClock24State(on)
  }
  const setStartCollapsed = (on: boolean) => {
    localStorage.setItem(KEY_COLLAPSED, String(on))
    setStartCollapsedState(on)
  }

  return (
    <SettingsContext.Provider
      value={{ accent, setAccent, clock24, setClock24, startCollapsed, setStartCollapsed }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
