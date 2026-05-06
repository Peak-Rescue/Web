// Uploads instructor photos from /public/images/instructors/ to Supabase Storage
// and updates the instructors.avatar field to the new public URL.
//
// Run with: node --env-file=.env.local scripts/migrate-instructor-photos.js

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, extname, basename } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const BUCKET = 'instructor-photos'
const PUBLIC_DIR = resolve(process.cwd(), 'public')

async function main() {
  // Create bucket if it doesn't exist
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.find(b => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true })
    if (error) throw new Error(`Failed to create bucket: ${error.message}`)
    console.log(`Created bucket: ${BUCKET}`)
  } else {
    console.log(`Bucket already exists: ${BUCKET}`)
  }

  // Fetch all instructors with local avatar paths
  const { data: instructors, error } = await supabase
    .from('instructors')
    .select('id, slug, avatar')

  if (error) throw new Error(`Failed to fetch instructors: ${error.message}`)

  for (const instructor of instructors) {
    if (!instructor.avatar || !instructor.avatar.startsWith('/images/')) {
      console.log(`  ${instructor.slug}: already migrated or no avatar, skipping`)
      continue
    }

    const localPath = resolve(PUBLIC_DIR, instructor.avatar.slice(1)) // strip leading /
    let fileBytes
    try {
      fileBytes = readFileSync(localPath)
    } catch {
      console.warn(`  ${instructor.slug}: file not found at ${localPath}, skipping`)
      continue
    }

    const ext = extname(basename(localPath)).toLowerCase()
    const storageKey = `${instructor.slug}${ext}`
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storageKey, fileBytes, { contentType, upsert: true })

    if (uploadError) {
      console.error(`  ${instructor.slug}: upload failed — ${uploadError.message}`)
      continue
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storageKey)

    const { error: updateError } = await supabase
      .from('instructors')
      .update({ avatar: publicUrl })
      .eq('id', instructor.id)

    if (updateError) {
      console.error(`  ${instructor.slug}: DB update failed — ${updateError.message}`)
    } else {
      console.log(`  ${instructor.slug}: ✓ ${publicUrl}`)
    }
  }

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
