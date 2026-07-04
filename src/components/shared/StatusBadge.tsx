import { Badge } from '@/components/ui/badge'
import { CheckCircle2, CircleDashed, CircleDot, AlertTriangle, XCircle, ArrowRightCircle } from 'lucide-react'

/** Status colors ship with an icon + label — never color alone. */
export function PaymentStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'Paid':
      return (
        <Badge variant="good">
          <CheckCircle2 className="h-3 w-3" /> Paid
        </Badge>
      )
    case 'Partial':
      return (
        <Badge variant="warning">
          <CircleDot className="h-3 w-3" /> Partial
        </Badge>
      )
    default:
      return (
        <Badge variant="neutral">
          <CircleDashed className="h-3 w-3" /> {status || 'Pending'}
        </Badge>
      )
  }
}

export function QuotationStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'Approved':
      return (
        <Badge variant="good">
          <CheckCircle2 className="h-3 w-3" /> Approved
        </Badge>
      )
    case 'Rejected':
      return (
        <Badge variant="critical">
          <XCircle className="h-3 w-3" /> Rejected
        </Badge>
      )
    case 'Converted':
      return (
        <Badge variant="accent">
          <ArrowRightCircle className="h-3 w-3" /> Converted
        </Badge>
      )
    default:
      return (
        <Badge variant="neutral">
          <CircleDashed className="h-3 w-3" /> {status || 'Pending'}
        </Badge>
      )
  }
}

export function OverdueBadge() {
  return (
    <Badge variant="critical">
      <AlertTriangle className="h-3 w-3" /> Overdue
    </Badge>
  )
}
