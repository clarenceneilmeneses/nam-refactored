import { startOfMonth, startOfYear, subDays } from 'date-fns'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { toISODate } from '@/lib/format'

export type DateRange = { from: string | null; to: string | null; preset: string }

export const PRESETS = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-7', label: 'Last 7 days' },
  { id: 'last-30', label: 'Last 30 days' },
  { id: 'last-90', label: 'Last 90 days' },
  { id: 'this-year', label: 'This year' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom range' },
] as const

export function rangeForPreset(preset: string): { from: string | null; to: string | null } {
  const today = new Date()
  switch (preset) {
    case 'this-month':
      return { from: toISODate(startOfMonth(today)), to: toISODate(today) }
    case 'last-7':
      return { from: toISODate(subDays(today, 6)), to: toISODate(today) }
    case 'last-30':
      return { from: toISODate(subDays(today, 29)), to: toISODate(today) }
    case 'last-90':
      return { from: toISODate(subDays(today, 89)), to: toISODate(today) }
    case 'this-year':
      return { from: toISODate(startOfYear(today)), to: toISODate(today) }
    default:
      return { from: null, to: null }
  }
}

export function defaultRange(): DateRange {
  return { preset: 'this-month', ...rangeForPreset('this-month') }
}

export function inRange(date: string | null, range: DateRange): boolean {
  if (!date) return false
  if (range.from && date < range.from) return false
  if (range.to && date > range.to) return false
  return true
}

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        className="w-auto"
        value={value.preset}
        onChange={(e) => {
          const preset = e.target.value
          onChange(preset === 'custom' ? { ...value, preset } : { preset, ...rangeForPreset(preset) })
        }}
        aria-label="Date range preset"
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
      {value.preset === 'custom' && (
        <>
          <Input
            type="date"
            className="w-auto"
            value={value.from ?? ''}
            onChange={(e) => onChange({ ...value, from: e.target.value || null })}
            aria-label="From date"
          />
          <span className="text-xs text-ink-muted">to</span>
          <Input
            type="date"
            className="w-auto"
            value={value.to ?? ''}
            onChange={(e) => onChange({ ...value, to: e.target.value || null })}
            aria-label="To date"
          />
        </>
      )}
    </div>
  )
}
