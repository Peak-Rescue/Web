# Deployment & Domain Runbook

How this site is hosted and how to point domains at it. The app is a Next.js
app on **Vercel** (project `web`, team `peak-rescue`) with **Supabase** as the
backend. It is **not** a static site — it needs the Vercel (Node) runtime.

Canonical domain: **`peak-rescue.com`** (bare apex). Everything else redirects
to it.

---

## 1. Vercel — domains

In the `web` project → **Domains**:

| Domain | Setting |
|---|---|
| `peak-rescue.com` | **Connect to Production** (serves the site, primary) |
| `www.peak-rescue.com` | **Redirect → `peak-rescue.com`** (308 Permanent) |
| `peakrescuemountainguides.com` | **Redirect → `peak-rescue.com`** (308 Permanent) |
| `www.peakrescuemountainguides.com` | **Redirect → `peak-rescue.com`** (308 Permanent) |

Add via **Add Existing** (the domains are registered at GoDaddy). Leave
"Redirect apex domains to www" **unchecked**. Domains show *Invalid
Configuration* until DNS (below) is pointed — that is expected.

## 2. DNS — GoDaddy packet (send to whoever manages DNS)

Both domains need the same two records. Use the generic values (Vercel's
panel may suggest newer per-domain values, but these old ones are uniform and
"continue to work" per Vercel).

For **peak-rescue.com** and **peakrescuemountainguides.com**:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` | 600 |
| CNAME | `www` | `cname.vercel-dns.com` | 600 |

Also: **delete old `@` A records and old `www` records** (they point at the
previous host), and **turn off Domain Forwarding / parking**. Keep the domains
on GoDaddy nameservers. SSL provisions automatically once DNS resolves.

## 3. Vercel — environment variables (Production)

Project → **Environment Variables**. These must exist for Production:

| Var | Value / notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** — server only, never exposed to the browser |
| `NEXT_PUBLIC_SITE_URL` | `https://peak-rescue.com` (used to build auth/invite redirect links) |
| `CRON_SECRET` | **secret** — any long random string; authorizes `/api/cron/notifications` (daily reminder emails). The **same value** must also be saved as a GitHub Actions secret named `CRON_SECRET` in this repo (Settings → Secrets → Actions), which the `reminder-emails.yml` workflow uses to call the route. |

The reminder sweep additionally relies on `RESEND_API_KEY` (to send) and
`GCAL_GENERAL_CALENDAR_ID` + `GOOGLE_SERVICE_ACCOUNT_KEY` (to read "hours
due" events off the Peak Rescue admin calendar); those already exist for the
contact form and calendar sync.

After changing any env var, **redeploy** (Deployments → latest → ⋯ → Redeploy)
— env changes only take effect on a new deploy.

## 4. Supabase — auth URL configuration

Dashboard → project `qejyeetwurhszyirhpxd` → **Authentication → URL
Configuration**:

- **Site URL:** `https://peak-rescue.com`
- **Redirect URLs** (allow-list):
  - `https://peak-rescue.com/auth/callback`
  - `https://peak-rescue.com/auth/confirm`
  - `https://web-pied-seven-39.vercel.app/**` (keep for testing on the Vercel URL)

Skipping this breaks magic-link sign-in and instructor invites on the live
domain (they build redirect URLs from `NEXT_PUBLIC_SITE_URL` and
`window.location.origin`).

## 5. Supabase — plan

Upgrade the project to **Pro**. The free tier auto-pauses after inactivity,
which would take a production site down.

## 6. Post-DNS verification

After GoDaddy applies the records (minutes to a couple hours):

1. Vercel → Domains: each domain flips to **Valid Configuration** with SSL.
2. In an incognito window:
   - `https://peak-rescue.com` loads the site with a valid padlock.
   - `https://www.peak-rescue.com` and both `peakrescuemountainguides.com`
     URLs **redirect** to `https://peak-rescue.com`.
   - Request a magic link / log in and confirm the email lands you on
     `peak-rescue.com` (verifies steps 3 and 4).
