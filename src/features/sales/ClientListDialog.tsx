import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useClients, useDeleteClient } from '@/hooks/useClients'
import type { ClientRow } from '@/types/database'

type ClientListDialogProps = {
  open: boolean
  onClose: () => void
  /** Select — fills the Sales Entry document header and closes. */
  onSelect: (client: ClientRow) => void
  /** ✎ Edit — the parent opens the ClientFormDialog prefilled. */
  onEdit: (client: ClientRow) => void
}

/** "Select from List" client manager: search, select, edit, delete. */
export function ClientListDialog({ open, onClose, onSelect, onEdit }: ClientListDialogProps) {
  const { data: clients } = useClients()
  const deleteClient = useDeleteClient()
  const [search, setSearch] = useState('')
  const [toDelete, setToDelete] = useState<ClientRow | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = clients ?? []
    return q ? all.filter((c) => c.company_name.toLowerCase().includes(q)) : all
  }, [clients, search])

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Client List"
        description="Select a client to fill the document header, or manage saved profiles."
        className="max-w-2xl"
      >
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients…" autoFocus />
        <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-hairline">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-hairline text-left text-xs text-ink-muted">
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-2 py-2 font-medium">TIN</th>
                <th className="px-2 py-2 font-medium">Terms</th>
                <th className="w-28 px-2 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink">{client.company_name}</span>
                    {client.address && <span className="block text-xs text-ink-muted">{client.address}</span>}
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-secondary">{client.tin || '—'}</td>
                  <td className="px-2 py-2 text-xs text-ink-secondary">{client.default_payment_term || '—'}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${client.company_name}`} onClick={() => onEdit(client)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Delete ${client.company_name}`}
                        onClick={() => setToDelete(client)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-critical" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Select ${client.company_name}`}
                        onClick={() => {
                          onSelect(client)
                          onClose()
                        }}
                      >
                        <Check className="h-3.5 w-3.5 text-good-text" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-ink-muted">
                    {search.trim() ? 'No matching clients' : 'No saved clients yet — use "Add New Client".'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await deleteClient.mutateAsync(toDelete)
            toast.success(`Deleted client "${toDelete.company_name}"`)
          } catch (e) {
            toast.error((e as Error).message)
          }
          setToDelete(null)
        }}
        title="Delete client profile?"
        description={`"${toDelete?.company_name ?? ''}" will be removed from the client list. Existing sales and quotations are not affected.`}
        confirmLabel="Delete"
        destructive
        busy={deleteClient.isPending}
      />
    </>
  )
}
