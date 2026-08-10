import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: courses } = await db.from('course_instances')
  .select('id, ref_number, location, region, venue_id, starts_at, course_type, custom_title').order('starts_at',{ascending:false})
const { data: venues } = await db.from('venues').select('id, name, region, region_code, active').order('name')
const { data: maps } = await db.from('library_items').select('id, title, region, venue_id').eq('bucket','map')
console.log('VENUES:'); venues.forEach(v=>console.log(` ${v.name} | region="${v.region??''}" code=${v.region_code??'-'} active=${v.active}`))
const byLoc = new Map()
for (const c of courses) { const k=(c.location??'').trim()||'(blank)'; byLoc.set(k,(byLoc.get(k)??0)+1) }
console.log(`\nCOURSES: ${courses.length} total, ${byLoc.size} distinct locations`)
console.log(`already tagged: region=${courses.filter(c=>c.region).length} venue=${courses.filter(c=>c.venue_id).length}`)
console.log('\nDISTINCT LOCATIONS (count):')
;[...byLoc.entries()].sort((a,b)=>b[1]-a[1]).forEach(([l,n])=>console.log(` ${String(n).padStart(3)}  ${l}`))
console.log(`\nMAP LIBRARY ITEMS: ${maps.length}`)
maps.forEach(m=>console.log(` ${m.title} | region=${m.region??'-'} venue=${m.venue_id??'-'}`))
