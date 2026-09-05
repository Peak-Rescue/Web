import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l && !l.startsWith('#') && l.includes('='))
  .map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
await db.from('course_pushes').delete().eq('id','8d7054c7-8ef8-4194-aa75-e81fcbb4f957')
const { count } = await db.from('course_pushes').select('*',{count:'exact',head:true})
console.log('test push removed; rows now:', count)
