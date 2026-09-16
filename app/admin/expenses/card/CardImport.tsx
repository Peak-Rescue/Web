'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtMoney } from '@/lib/expenses'
import { tableFromCsv } from '@/lib/csv'
import {
  guessColumns,
  detectDayFirst,
  mapRows,
  suggestFlipSign,
  type ColumnMap,
} from '@/lib/card-import'
import { importCardCharges } from './actions'

// Bringing a statement in, without knowing what a statement looks like.
//
// Every bank exports differently and the same bank changes its mind, so
// nothing about the format is assumed. The file is parsed, the columns are
// guessed from their headers, and then — the important part — the guess is
// shown as the first few charges the import is about to make. A mapping that
// is wrong is obvious as soon as it is rendered as money and dates; the same
// mapping described as "column 3 → amount" is not.
//
// The preview is drawn by the same functions the server imports with, so what
// is on screen is what lands.

const ROLES: { key: keyof ColumnMap; label: string; hint: string }[] = [
  { key: 'date', label: 'Date', hint: 'When it was spent' },
  { key: 'description', label: 'Description', hint: 'The merchant' },
  { key: 'amount', label: 'Amount', hint: 'One signed column' },
  { key: 'debit', label: 'Debit', hint: 'Or two columns: out' },
  { key: 'credit', label: 'Credit', hint: '…and back in' },
  { key: 'cardholder', label: 'Card', hint: 'Whose, if it says' },
]

const BOX = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500'

export default function CardImport() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [map, setMap] = useState<ColumnMap | null>(null)
  const [flipSign, setFlipSign] = useState(false)
  const [dayFirst, setDayFirst] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ imported: number; skipped: number; rejected: number } | null>(null)

  const table = useMemo(() => (text.trim() ? tableFromCsv(text) : null), [text])

  // A file arriving replaces every answer about the last one: its columns, its
  // signs, its dates. Reading them here rather than in an effect keeps the
  // state honest — an effect would leave the old mapping on screen for a frame,
  // pointing at columns that no longer exist.
  function load(raw: string, name: string) {
    const parsed = tableFromCsv(raw)
    setText(raw)
    setSourceName(name)
    setDone(null)
    setError(parsed ? null : 'There was nothing to read in that file')
    if (!parsed) {
      setMap(null)
      return
    }
    const guess = guessColumns(parsed.headers)
    const firstDay = detectDayFirst(parsed.rows.map((r) => (guess.date === null ? '' : r[guess.date] ?? '')))
    const preview = mapRows(parsed, guess, { dayFirst: firstDay })
    setMap(guess)
    setDayFirst(firstDay)
    setFlipSign(suggestFlipSign(preview.rows.map((r) => r.amount)))
  }

  const mapped = useMemo(
    () => (table && map ? mapRows(table, map, { flipSign, dayFirst }) : null),
    [table, map, flipSign, dayFirst]
  )

  const ready = Boolean(table && map && map.date !== null && (map.amount !== null || map.debit !== null || map.credit !== null))

  async function run() {
    if (!table || !map) return
    setBusy(true)
    setError(null)
    try {
      const result = await importCardCharges({ text, sourceName, map, flipSign, dayFirst })
      setDone(result)
      setText('')
      setMap(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import that')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border border-zinc-800 rounded p-4">
      <h2 className="text-sm font-semibold text-zinc-200">Import a statement</h2>
      <p className="text-xs text-zinc-500 mt-1">
        Any CSV the card exports. Charges already imported are recognised and skipped, so overlapping statements
        are safe to bring in twice.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-xs text-zinc-400">
          <span className="sr-only">CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              load(await file.text(), file.name)
            }}
            className="text-xs text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-zinc-800 file:text-zinc-200 file:text-xs hover:file:bg-zinc-700 file:transition-colors"
          />
        </label>
        <span className="text-xs text-zinc-600">or paste it below</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => load(e.target.value, sourceName || 'Pasted')}
        rows={text ? 3 : 2}
        placeholder="Date,Description,Amount…"
        className={`${BOX} w-full mt-3 font-mono text-xs`}
      />

      {done && (
        <p className="mt-3 text-xs text-zinc-300">
          Imported <span className="font-medium">{done.imported}</span>{' '}
          {done.imported === 1 ? 'charge' : 'charges'}
          {done.skipped > 0 && <> · {done.skipped} already here</>}
          {done.rejected > 0 && <> · {done.rejected} unreadable and left out</>}.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-pr-red-light">{error}</p>}

      {table && map && (
        <div className="mt-4 space-y-4">
          {table.skippedLines > 0 && (
            <p className="text-xs text-zinc-500">
              Ignored {table.skippedLines} {table.skippedLines === 1 ? 'line' : 'lines'} above the header.
            </p>
          )}

          {/* Which column is which. Guessed, and every guess changeable —
              a header called "Amount" is sometimes the balance. */}
          <div className="flex flex-wrap gap-3">
            {ROLES.map((role) => (
              <label key={role.key} className="text-xs text-zinc-400">
                <span className="block mb-1">
                  {role.label} <span className="text-zinc-600">{role.hint}</span>
                </span>
                <select
                  value={map[role.key] ?? ''}
                  onChange={(e) =>
                    setMap({ ...map, [role.key]: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  className={BOX}
                >
                  <option value="">— none —</option>
                  {table.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flipSign} onChange={(e) => setFlipSign(e.target.checked)} />
              The file signs purchases negative
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={dayFirst} onChange={(e) => setDayFirst(e.target.checked)} />
              Dates are day/month
            </label>
          </div>

          {/* The guess, as charges. This is the check that actually catches a
              wrong mapping: a date reading 2026-03-09 when the statement says
              September, or every amount arriving negative. */}
          {mapped && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">
                {mapped.rows.length} {mapped.rows.length === 1 ? 'charge' : 'charges'} ready
                {mapped.rejected.length > 0 && <> · {mapped.rejected.length} the importer cannot read</>}
              </p>
              <div className="overflow-x-auto border border-zinc-800 rounded">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-zinc-800">
                    {mapped.rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 text-zinc-400 whitespace-nowrap">{r.posted_date}</td>
                        <td className="px-2 py-1.5 text-zinc-200">{r.description}</td>
                        <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">{r.cardholder}</td>
                        <td className="px-2 py-1.5 text-right text-zinc-200 whitespace-nowrap">
                          {fmtMoney(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mapped.rejected.length > 0 && (
                <p className="text-xs text-zinc-600 mt-2">
                  Left out: {mapped.rejected.slice(0, 3).map((r) => `line ${r.line} (${r.reason})`).join(', ')}
                  {mapped.rejected.length > 3 && `, and ${mapped.rejected.length - 3} more`}.
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => void run()}
            disabled={!ready || busy || (mapped?.rows.length ?? 0) === 0}
            className="px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded text-xs font-medium hover:bg-white transition-colors disabled:opacity-40"
          >
            {busy ? 'Importing…' : `Import ${mapped?.rows.length ?? 0} charges`}
          </button>
        </div>
      )}
    </section>
  )
}
