import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2] }
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{autoRefreshToken:false,persistSession:false} })
const s=Date.now()
const { data, error } = await a.auth.admin.generateLink({ type:'magiclink', email:'nadav@peak-rescue.com' })
if (error) { console.error('MINT FAILED', error.message); process.exit(1) }
console.error(`(mint took ${((Date.now()-s)/1000).toFixed(2)}s)`)
process.stdout.write(data.properties.hashed_token)
