import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { KEY_HOME_ROUTE } from '@/hooks/useAuth'

/** A selectable brand accent. Each preset carries light + dark variants so the
 *  chosen colour reads correctly in both themes (soft backgrounds especially).
 *  'custom' derives those variants from a user-picked hue (see deriveAccentVariants). */
export type AccentKey = 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'custom'

type AccentPreset = {
  key: Exclude<AccentKey, 'custom'>
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

function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [217, 89, 51] // fall back to the blue preset's hue
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = d / (l > 0.5 ? 2 - max - min : max + min)
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`

/**
 * Turns any picked colour into safe accent variants by keeping its hue and
 * re-toning it: lightness is fixed to levels where white button text and the
 * soft backgrounds stay readable in both themes. Near-gray picks stay gray.
 */
export function deriveAccentVariants(hex: string): { light: AccentPreset['light']; dark: AccentPreset['dark'] } {
  const [h, rawS] = hexToHsl(hex)
  const s = rawS < 15 ? rawS : Math.min(Math.max(rawS, 45), 95)
  return {
    light: { accent: hsl(h, s, 42), strong: hsl(h, s, 30), soft: hsl(h, Math.min(s, 60), 94) },
    dark: { accent: hsl(h, Math.min(s, 70), 72), strong: hsl(h, Math.min(s, 70), 80), soft: hsl(h, Math.min(s, 40), 22) },
  }
}

/** Root font-size presets — everything is rem-based, so this scales the whole app. */
export type FontScale = 'small' | 'default' | 'large'
const FONT_SIZES: Record<FontScale, string> = { small: '15px', default: '', large: '17px' }
export const FONT_SCALES: Array<{ key: FontScale; label: string }> = [
  { key: 'small', label: 'Small' },
  { key: 'default', label: 'Default' },
  { key: 'large', label: 'Large' },
]

type SettingsContextValue = {
  accent: AccentKey
  setAccent: (key: AccentKey) => void
  /** Hex behind the 'custom' accent (kept even while a preset is active). */
  customAccent: string
  setCustomAccent: (hex: string) => void
  clock24: boolean
  setClock24: (on: boolean) => void
  startCollapsed: boolean
  setStartCollapsed: (on: boolean) => void
  fontScale: FontScale
  setFontScale: (scale: FontScale) => void
  /** '' = automatic (by permission); otherwise a HOME_ROUTE_OPTIONS path. */
  homeRoute: string
  setHomeRoute: (path: string) => void
  compactTables: boolean
  setCompactTables: (on: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

const KEY_ACCENT = 'nam-accent'
const KEY_ACCENT_CUSTOM = 'nam-accent-custom'
const KEY_CLOCK24 = 'nam-clock24'
const KEY_COLLAPSED = 'nam-start-collapsed'
const KEY_FONT = 'nam-font-scale'
const KEY_HOME = KEY_HOME_ROUTE
const KEY_DENSITY = 'nam-compact-tables'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  return allowed.includes(v as T) ? (v as T) : fallback
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme()
  const [accent, setAccentState] = useState<AccentKey>(() =>
    readStored(KEY_ACCENT, [...ACCENTS.map((a) => a.key), 'custom' as const], 'blue'),
  )
  const [customAccent, setCustomAccentState] = useState<string>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_ACCENT_CUSTOM) : null) ?? '#00838f',
  )
  const [compactTables, setCompactTablesState] = useState<boolean>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_DENSITY) : null) === 'true',
  )
  const [clock24, setClock24State] = useState<boolean>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_CLOCK24) : null) === 'true',
  )
  const [startCollapsed, setStartCollapsedState] = useState<boolean>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_COLLAPSED) : null) === 'true',
  )
  const [fontScale, setFontScaleState] = useState<FontScale>(() =>
    readStored(KEY_FONT, FONT_SCALES.map((f) => f.key), 'default'),
  )
  const [homeRoute, setHomeRouteState] = useState<string>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_HOME) : null) ?? '',
  )

  // Apply the accent as inline CSS-var overrides on <html>. Recomputed on theme
  // change so the soft background matches the active light/dark palette.
  useEffect(() => {
    const preset =
      accent === 'custom' ? deriveAccentVariants(customAccent) : (ACCENTS.find((a) => a.key === accent) ?? ACCENTS[0])
    const v = resolved === 'dark' ? preset.dark : preset.light
    const root = document.documentElement.style
    root.setProperty('--color-accent', v.accent)
    root.setProperty('--color-accent-strong', v.strong)
    root.setProperty('--color-accent-soft', v.soft)
  }, [accent, customAccent, resolved])

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
  const setFontScale = (scale: FontScale) => {
    localStorage.setItem(KEY_FONT, scale)
    setFontScaleState(scale)
  }
  const setHomeRoute = (path: string) => {
    if (path) localStorage.setItem(KEY_HOME, path)
    else localStorage.removeItem(KEY_HOME)
    setHomeRouteState(path)
  }
  const setCustomAccent = (hex: string) => {
    localStorage.setItem(KEY_ACCENT_CUSTOM, hex)
    localStorage.setItem(KEY_ACCENT, 'custom')
    setCustomAccentState(hex)
    setAccentState('custom')
  }
  const setCompactTables = (on: boolean) => {
    localStorage.setItem(KEY_DENSITY, String(on))
    setCompactTablesState(on)
  }

  // Scale the root font-size; Tailwind sizes are rem-based so the app follows.
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZES[fontScale]
  }, [fontScale])

  // Table density: index.css keys off data-density to tighten row padding.
  useEffect(() => {
    if (compactTables) document.documentElement.dataset.density = 'compact'
    else delete document.documentElement.dataset.density
  }, [compactTables])

  return (
    <SettingsContext.Provider
      value={{
        accent,
        setAccent,
        customAccent,
        setCustomAccent,
        clock24,
        setClock24,
        startCollapsed,
        setStartCollapsed,
        fontScale,
        setFontScale,
        homeRoute,
        setHomeRoute,
        compactTables,
        setCompactTables,
      }}
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
