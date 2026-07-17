import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSaveClient } from '@/hooks/useClients'
import type { ClientRow } from '@/types/database'

type ClientFormDialogProps = {
  open: boolean
  onClose: () => void
  /** Present = edit that profile; absent = add-new (upsert by company name). */
  client?: ClientRow | null
  onSaved?: (client: ClientRow) => void
}

type Draft = {
  company_name: string
  tin: string
  default_payment_term: string
  address: string
  contact_person: string
  contact_number: string
  email: string
}

const blank: Draft = {
  company_name: '',
  tin: '',
  default_payment_term: '',
  address: '',
  contact_person: '',
  contact_number: '',
  email: '',
}

/** Add / edit a client profile (legacy save_client.php modal). */
export function ClientFormDialog({ open, onClose, client, onSaved }: ClientFormDialogProps) {
  const saveClient = useSaveClient()
  const [draft, setDraft] = useState<Draft>(blank)

  useEffect(() => {
    if (!open) return
    setDraft(
      client
        ? {
            company_name: client.company_name,
            tin: client.tin ?? '',
            default_payment_term: client.default_payment_term ?? '',
            address: client.address ?? '',
            contact_person: client.contact_person ?? '',
            contact_number: client.contact_number ?? '',
            email: client.email ?? '',
          }
        : blank,
    )
  }, [open, client])

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function onSave() {
    if (!draft.company_name.trim()) {
      toast.error('Company name is required')
      return
    }
    try {
      const saved = await saveClient.mutateAsync({
        id: client?.id,
        company_name: draft.company_name.trim(),
        tin: draft.tin.trim() || null,
        default_payment_term: draft.default_payment_term.trim() || null,
        address: draft.address.trim() || null,
        contact_person: draft.contact_person.trim() || null,
        contact_number: draft.contact_number.trim() || null,
        email: draft.email.trim() || null,
      })
      toast.success(`Client "${saved.company_name}" saved`)
      onSaved?.(saved)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={client ? 'Edit Client' : 'Add New Client'}
      description="Client profiles auto-fill the document header on the Sales Entry form."
      className="max-w-md"
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="cf-name">Company Name *</Label>
          <Input id="cf-name" value={draft.company_name} autoFocus onChange={(e) => set('company_name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="cf-tin">TIN</Label>
            <Input id="cf-tin" value={draft.tin} placeholder="000-000-000-000" onChange={(e) => set('tin', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cf-term">Default Payment Term</Label>
            <Input
              id="cf-term"
              value={draft.default_payment_term}
              placeholder="e.g. 30 Days"
              onChange={(e) => set('default_payment_term', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-address">Address</Label>
          <Input id="cf-address" value={draft.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="cf-contact">Contact Person</Label>
            <Input id="cf-contact" value={draft.contact_person} onChange={(e) => set('contact_person', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cf-number">Contact Number</Label>
            <Input id="cf-number" value={draft.contact_number} placeholder="e.g. 0917-000-0000" onChange={(e) => set('contact_number', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-email">Email Address</Label>
          <Input id="cf-email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} disabled={saveClient.isPending}>
          {saveClient.isPending ? 'Saving…' : 'Save Client'}
        </Button>
      </div>
    </Dialog>
  )
}
