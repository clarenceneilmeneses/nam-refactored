import { Inbox } from 'lucide-react'

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Inbox className="h-8 w-8 text-baseline" />
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
      {description && <p className="text-xs text-ink-muted">{description}</p>}
    </div>
  )
}
