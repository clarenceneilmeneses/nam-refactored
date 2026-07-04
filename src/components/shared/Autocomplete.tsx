import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type AutocompleteOption<T> = { label: string; data: T }

type AutocompleteProps<T> = {
  value: string
  onChange: (text: string) => void
  onSelect: (option: AutocompleteOption<T>) => void
  options: AutocompleteOption<T>[]
  placeholder?: string
  maxResults?: number
  id?: string
  className?: string
  renderOption?: (option: AutocompleteOption<T>) => React.ReactNode
}

/** Lightweight combobox: free text allowed, picking a suggestion fires onSelect. */
export function Autocomplete<T>({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  maxResults = 8,
  id,
  className,
  renderOption,
}: AutocompleteProps<T>) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, maxResults)
  }, [value, options, maxResults])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function pick(option: AutocompleteOption<T>) {
    onSelect(option)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(matches[highlight])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full min-w-64 overflow-y-auto rounded-md border border-hairline bg-surface py-1 shadow-lg">
          {matches.map((option, i) => (
            <li key={`${option.label}-${i}`}>
              <button
                type="button"
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-accent-soft/50 cursor-pointer',
                  i === highlight && 'bg-accent-soft/50',
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(option)
                }}
              >
                {renderOption ? renderOption(option) : option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
