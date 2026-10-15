'use client'

import { useState } from 'react'
import Link from 'next/link'
import VenueSettings from '@/components/VenueSettings'
import { type Venue } from '@/lib/library'
import { regionLabel } from '@/lib/regions'
import CloseButton from '@/components/CloseButton'


export default function VenueRow({ venue, itemCount }: { venue: Venue; itemCount: number }) {
  const [open, setOpen] = useState(false)


  return (
    <div id={`venue-${venue.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900 scroll-mt-6">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{venue.name}</span>
            {venue.client_name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{venue.client_name}</span>
            )}
            {!venue.active && <span className="text-[10px] text-zinc-600">inactive</span>}
          </div>
          <p className="text-[11px] text-zinc-600 mt-0.5">
            {venue.region || regionLabel(venue.region_code) || 'no region'} ·{' '}
            <Link href={`/admin/library?status=all&venue=${venue.id}`} className="hover:text-zinc-400 transition-colors underline">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </Link>
            {venue.links.length > 0 && ` · ${venue.links.length} link${venue.links.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {open ? (
          <CloseButton onClick={() => setOpen((v) => !v)} />
        ) : (
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-zinc-400 hover:text-white transition-colors shrink-0">Edit</button>
        )}
      </div>

      {open && <VenueSettings venue={venue} itemCount={itemCount} onDone={() => setOpen(false)} />}
    </div>
  )
}
