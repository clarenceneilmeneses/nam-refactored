import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateQuotationGroup } from '@/hooks/useQuotations'

type EditGroupDialogProps = {
  quoteRef: string
  company: string | null
  poNumber: string | null
  paymentTerm: string | null
  remarks: string | null
  onClose: () => void
}

/** Edit the shared PO / terms / remarks of every row in a quote group. Mount only while open. */
export function EditGroupDialog({ quoteRef, company, poNumber, paymentTerm, remarks, onClose }: EditGroupDialogProps) {
  const updateGroup = useUpdateQuotationGroup()
  const [po, setPo] = useState(poNumber ?? '')
  const [terms, setTerms] = useState(paymentTerm ?? '')
  const [notes, setNotes] = useState(remarks ?? '')

  async function save() {
    try {
      await updateGroup.mutateAsync({
        quoteRef,
        company,
        patch: {
          po_number: po.trim() || null,
          payment_term: terms.trim() || null,
          remarks: notes.trim() || null,
        },
      })
      toast.success(`Group ${quoteRef} updated`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Edit Group ${quoteRef}`} description={`Applies to every item of ${company ?? 'this group'}.`}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="eg-po">Inquiry # / PO</Label>
          <Input id="eg-po" value={po} onChange={(e) => setPo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="eg-terms">Terms</Label>
          <Input id="eg-terms" value={terms} placeholder="e.g. 30 days" onChange={(e) => setTerms(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="eg-remarks">Remarks</Label>
          <Textarea id="eg-remarks" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={updateGroup.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateGroup.isPending}>
            {updateGroup.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
