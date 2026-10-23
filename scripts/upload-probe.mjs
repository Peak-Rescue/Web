// Walks the server side of "add new file" on a course, one step at a time, so
// a failure names the step instead of the whole page. Everything it makes, it
// removes. Run with: node --env-file=.env.local scripts/upload-probe.mjs <instance-id>
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const id = process.argv[2]
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const step = async (name, fn) => {
  try { const r = await fn(); console.log('ok  ', name, r ?? ''); return r }
  catch (e) { console.log('FAIL', name, e.message); process.exit(1) }
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data }

const path = `courses/${id}/resources/${randomUUID()}.pdf`
await step('signed upload url', async () => must(await a.storage.from('task-documents').createSignedUploadUrl(path)).path)
await step('the course row', async () =>
  JSON.stringify(must(await a.from('course_instances').select('region, venue_id, course_type, custom_categories').eq('id', id).single())))
const item = await step('library row', async () =>
  must(await a.from('library_items').insert({
    title: 'Upload probe', source_type: 'file', storage_path: path, kind: 'medevac',
    bucket: 'documents', admin_only: false, audience: 'internal', disciplines: [], topics: [], status: 'published',
  }).select('id').single()).id)
await step('url back onto it', async () => must(await a.from('library_items').update({ url: `/api/library/file/${item}` }).eq('id', item)))
await step('the filing choices', async () => must(await a.from('library_items').update({
  kind: 'medevac', bucket: 'documents', audience: 'internal', admin_only: false,
  disciplines: [], topics: [], description: null, client_id: null, course_types: [],
  venue_id: null, site_id: null, region: null, updated_at: new Date().toISOString(),
}).eq('id', item)))
const { data: sorted } = await a.from('course_resources').select('sort_order').eq('instance_id', id).order('sort_order', { ascending: false }).limit(1)
await step('onto the course', async () => must(await a.from('course_resources').insert({
  instance_id: id, library_item_id: item, audience: 'internal', sort_order: (sorted?.[0]?.sort_order ?? 0) + 1,
}).select('id').single()).id)

await a.from('course_resources').delete().eq('library_item_id', item)
await a.from('library_items').delete().eq('id', item)
console.log('cleaned up')
