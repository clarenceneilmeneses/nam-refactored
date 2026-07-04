import { useMemo, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useClients } from '@/hooks/useClients'
import { useSales } from '@/hooks/useSales'

export type PickedClient = { company_name: string; address: string | null }

type ClientPickerDialogProps = {
  open: boolean
  onClose: () => void
  onPick: (client: PickedClient) => void
}

/**
 * "Select from List" client browser for the Draft Workspace. Lists the
 * clients master plus every company seen in sales (the clients table can be
 * empty), with the latest known address.
 */
export function ClientPickerDialog({ open, onClose, onPick }: ClientPickerDialogProps) {
  const { data: clients } = useClients()
  const { data: sales } = useSales()
  const [search, setSearch] = useState('')

  const companies = useMemo<PickedClient[]>(() => {
    const seen = new Map<string, PickedClient>()
    for (const c of clients ?? []) seen.set(c.company_name.trim().toLowerCase(), { company_name: c.company_name, address: c.address })
    // Sales come newest-first, so the first address seen per company is the latest.
    for (const s of sales ?? []) {
      if (!s.company) continue
      const key = s.company.trim().toLowerCase()
      const existing = seen.get(key)
      if (!existing) seen.set(key, { company_name: s.company, address: s.address })
      else if (!existing.address && s.address) existing.address = s.address
    }
    return [...seen.values()].sort((a, b) => a.company_name.localeCompare(b.company_name))
  }, [clients, sales])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? companies.filter((c) => c.company_name.toLowerCase().includes(q)) : companies
  }, [companies, search])

  return (
    <Dialog open={open} onClose={onClose} title="Select Client" description="Pick a client to fill in the company details." className="max-w-md">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients…" autoFocus />
      <ul className="mt-3 max-h-80 divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
        {filtered.map((client) => (
          <li key={client.company_name}>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-accent-soft/40 cursor-pointer"
              onClick={() => {
                onPick(client)
                onClose()
              }}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-muted" /> {client.company_name}
              </span>
              {client.address && <span className="mt-0.5 block pl-5.5 text-xs text-ink-muted">{client.address}</span>}
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">No matching clients</li>}
      </ul>
    </Dialog>
  )
}
