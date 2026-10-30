'use client'

import { useState } from 'react'
import MeetingPointForm from './MeetingPointForm'
import Coords from '@/components/Coords'
import { type MeetingPointRecord } from '@/lib/sites'
import { type Venue } from '@/lib/library'

// Every meeting point a venue holds, whether or not a canyon calls it usual.
// A lot that any Maui day might pick and no canyon meets at by default was
// otherwise drawn nowhere on this page — it existed only as an option in a
// course day's picker.
export default function VenueMeetingPoints({
  points,
  usedBy,
  venues,
  canEdit,
}: {
  points: MeetingPointRecord[]
  /** The canyons that meet at each by default, by meeting point id. */
  usedBy: Record<string, string[]>
  venues: Venue[]
  canEdit: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  if (points.length === 0) return null
  return (
    <div className="mt-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-700 mb-1.5">Meeting points</p>
      <div className="space-y-2">
        {points.map((p) =>
          editing === p.id ? (
            <MeetingPointForm key={p.id} point={p} venues={venues} onDone={() => setEditing(null)} />
          ) : (
            <div key={p.id} className={`rounded border border-zinc-800 px-3 py-2 text-xs space-y-1 ${p.active ? '' : 'opacity-50'}`}>
              <div className="flex items-start gap-2">
                <p className="flex-1 min-w-0 text-zinc-200">{p.name}</p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditing(p.id)}
                    className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
              {p.directions && !/^\s*-?[\d.]+\s*,\s*-?[\d.]+\s*$/.test(p.directions) && (
                <p className="text-zinc-400 whitespace-pre-line leading-relaxed max-w-prose">{p.directions}</p>
              )}
              {p.coords && <Coords value={p.coords} className="text-[11px]" />}
              <p className="text-[11px] text-zinc-600">
                {(usedBy[p.id] ?? []).length > 0
                  ? `Usual for ${(usedBy[p.id] ?? []).join(', ')}`
                  : 'Any day here can pick it'}
              </p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
