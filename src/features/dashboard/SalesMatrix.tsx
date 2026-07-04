import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { formatPeso } from '@/lib/format'
import { GREEN, INDIGO } from './palette'
import type { MatrixCategory } from './aggregate'

/** Expandable category → items drill-down table; respects all global filters. */
export function SalesMatrix({ data }: { data: MatrixCategory[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  const toggle = (category: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-hairline text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
          <th className="px-2 py-2 text-left">Category / Item</th>
          <th className="px-2 py-2 text-right">Qty Sold</th>
          <th className="px-2 py-2 text-right">Total Revenue</th>
          <th className="px-2 py-2 text-right">Net Profit</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {data.map((cat) => {
          const isOpen = open.has(cat.category)
          return (
            <Fragment key={cat.category}>
              <tr
                onClick={() => toggle(cat.category)}
                className={`cursor-pointer border-b border-hairline transition-colors hover:bg-black/[0.03] ${
                  isOpen ? 'bg-black/[0.04]' : ''
                }`}
              >
                <td className="px-2 py-2 font-medium">
                  <span className="flex items-center gap-1.5">
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                    {cat.category}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">{cat.qty.toLocaleString()}</td>
                <td className="px-2 py-2 text-right font-medium" style={{ color: INDIGO }}>
                  {formatPeso(cat.revenue)}
                </td>
                <td className="px-2 py-2 text-right font-medium" style={{ color: GREEN }}>
                  {formatPeso(cat.profit)}
                </td>
              </tr>
              {isOpen && (
                <tr className="border-b border-hairline">
                  <td colSpan={4} className="bg-page/80 p-0">
                    <table className="w-full text-xs">
                      <tbody className="tabular-nums">
                        {cat.items.map((item) => (
                          <tr key={item.item} className="border-b border-hairline/60 last:border-0">
                            <td className="py-1.5 pl-10 pr-2 text-ink-secondary">{item.item}</td>
                            <td className="w-24 px-2 py-1.5 text-right">{item.qty.toLocaleString()}</td>
                            <td className="w-40 px-2 py-1.5 text-right">{formatPeso(item.revenue)}</td>
                            <td className="w-40 px-2 py-1.5 text-right">{formatPeso(item.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
