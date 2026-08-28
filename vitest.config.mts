import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests for the logic that decides things — the resolution chains, the
// date arithmetic, the counts a button promises before it sends an email.
//
// Deliberately no database. The dev server and this repo both point at the
// live Supabase project, so a test that wrote anything would write it to
// production. Authorization, RLS and the storage paths are therefore NOT
// covered here and still have to be checked by hand.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
