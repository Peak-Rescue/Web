import { fmtMoney, round2 } from '@/lib/expenses'

// Side-by-side snapshot of every COA's bottom line — the at-a-glance view
// for weighing options internally (server-rendered from saved estimates, so
// in-flight edits show after their autosave lands).
export default function CoaComparison({
  coas,
}: {
  coas: { title: string; margin: number; items: { qty: number; rate: number }[] }[]
}) {
  const cols = coas.map((c) => {
    const cost = round2(c.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0))
    const marginAmount = round2(cost * c.margin)
    return { title: c.title, margin: c.margin, cost, marginAmount, quote: round2(cost + marginAmount) }
  })

  return (
    <div className="mt-6 bg-zinc-900 rounded-lg border border-zinc-800 overflow-x-auto">
      <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">COA comparison</th>
            {cols.map((c, i) => (
              <th key={i} className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-4 py-2 text-xs text-zinc-400">Cost</td>
            {cols.map((c, i) => (
              <td key={i} className="px-4 py-2 text-right text-zinc-300">{fmtMoney(c.cost)}</td>
            ))}
          </tr>
          <tr>
            <td className="px-4 py-2 text-xs text-zinc-400">Margin</td>
            {cols.map((c, i) => (
              <td key={i} className="px-4 py-2 text-right text-zinc-300">
                {fmtMoney(c.marginAmount)} <span className="text-zinc-600 text-xs">({Math.round(c.margin * 100)}%)</span>
              </td>
            ))}
          </tr>
          <tr className="border-t border-zinc-800">
            <td className="px-4 py-2.5 text-xs text-zinc-400">Quote price</td>
            {cols.map((c, i) => (
              <td key={i} className="px-4 py-2.5 text-right font-semibold">{fmtMoney(c.quote)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
