import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Merge } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useMergeCompanies, useQuotations } from '@/hooks/useQuotations'
import { useSales } from '@/hooks/useSales'

type MergeClientsDialogProps = {
  onClose: () => void
}

/**
 * Merge duplicate client spellings: every quotation and sale of the checked
 * companies is re-pointed at the chosen target name. Mount only while open.
 */
export function MergeClientsDialog({ onClose }: MergeClientsDialogProps) {
  const { data: quotations } = useQuotations()
  const { data: sales } = useSales()
  const mergeCompanies = useMergeCompanies()

  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [target, setTarget] = useState('')

  const companies = useMemo(() => {
    const set = new Set<string>()
    for (const q of quotations ?? []) if (q.company) set.add(q.company)
    for (const s of sales ?? []) if (s.company) set.add(s.company)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [quotations, sales])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? companies.filter((c) => c.toLowerCase().includes(q)) : companies
  }, [companies, search])

  function toggle(name: string) {
    const next = checked.includes(name) ? checked.filter((c) => c !== name) : [...checked, name]
    setChecked(next)
    if (!next.includes(target)) setTarget(next[0] ?? '')
    else if (!target && next.length > 0) setTarget(next[0])
  }

  async function merge() {
    if (checked.length < 2) {
      toast.error('Check at least two companies to merge')
      return
    }
    if (!target || !checked.includes(target)) {
      toast.error('Pick which name to keep')
      return
    }
    try {
      await mergeCompanies.mutateAsync({ sources: checked, target })
      toast.success(`Merged ${checked.length - 1} name(s) into "${target}"`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Merge Duplicate Clients"
      description="Check the duplicate spellings, pick the name to keep, and every quotation and sale is updated."
      className="max-w-md"
    >
      <div className="space-y-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies…" />
        <ul className="max-h-64 divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
          {filtered.map((name) => (
            <li key={name}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent-soft/30">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[#2a78d6]"
                  checked={checked.includes(name)}
                  onChange={() => toggle(name)}
                />
                <span className="truncate" title={name}>{name}</span>
              </label>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">No matching companies</li>}
        </ul>
        {checked.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="mc-target">Keep this name</Label>
            <Select id="mc-target" value={target} onChange={(e) => setTarget(e.target.value)}>
              {checked.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={mergeCompanies.isPending}>
            Cancel
          </Button>
          <Button onClick={merge} disabled={mergeCompanies.isPending || checked.length < 2}>
            <Merge className="h-4 w-4" /> {mergeCompanies.isPending ? 'Merging…' : `Merge ${checked.length || ''} selected`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
