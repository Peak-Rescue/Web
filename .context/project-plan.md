# Peak Rescue Web — Project Plan

## Overview

A unified website that merges peak-rescue.com and peakrescuemountainguides.com under the **Peak Rescue** brand, with a built-in LMS (Learning Management System) for instructors and students. Designed to be more flexible and brandable than Google Classroom, with Google Drive as the content source of truth and YouTube for video delivery.

**Brand:** Peak Rescue (primary). "Peak Rescue Mountain Guides" used as DBA for mountain guiding programs only.
**Replaces:** peak-rescue.com + peakrescuemountainguides.com
**Future:** Potential gear store integration with elevatedsafety.com (Phase 9+, not in initial build).

---

## Tech Stack

- **Framework**: Next.js (App Router)
- **Auth + DB**: Supabase
- **Payments**: Stripe
- **Email**: Resend (or Postmark)
- **Content - Docs**: Google Drive API (service account)
- **Content - Video**: YouTube embeds
- **Social Gallery**: Instagram Graph API
- **Hosting**: Vercel

---

## User Roles

| Role | Access |
|---|---|
| `admin` | Everything — all courses, users, enrollments |
| `instructor` | Their courses, enrolled students, can add content |
| `student` | Enrolled courses and materials only |
| (public) | Marketing pages, service listings, gallery, blog |

---

## Site Structure

| Route | Who | Purpose |
|---|---|---|
| `/` | Public | Homepage |
| `/services` | Public | All training programs (filterable by category) |
| `/services/[slug]` | Public | Individual service detail + contact to book |
| `/instructors` | Public | Full team — all instructors |
| `/instructors/[slug]` | Public | Individual instructor profile |
| `/courses` | Public | LMS course catalog |
| `/courses/[slug]` | Public | Course detail + enroll/buy |
| `/courses/[slug]/learn` | Enrolled students | Content viewer (modules + items) |
| `/gallery` | Public | Instagram feed (auto-updating) |
| `/blog` | Public | Blog posts |
| `/blog/[slug]` | Public | Individual post |
| `/contact` | Public | Contact form |
| `/login` | Public | Auth (magic link email) |
| `/dashboard` | Students | Enrolled courses, progress, notifications |
| `/instructor` | Instructors | Manage courses, view enrolled students |
| `/instructor/courses/[id]` | Instructors | Edit course modules + items |
| `/admin` | Admin | All courses, users, enrollments |

---

## Services — Full List

Organized into 4 categories used for filtering and display:

### Mountain & Alpine
- Mountain & Rope Rescue
- Mountain Mobility Training (summer + winter)
- Cold Weather / Arctic Operations
- Aerial Assets (fast rope, hoist, rappel)

### Water & Canyon
- Swiftwater Rescue
- Canyoneering & Canyon Mobility
- Maritime Mobility
- Water Mobility

### Urban & Industrial
- Confined Space Rescue
- Fall Protection & Rope Access
- Urban Mobility & Access
- Emergency Response Team Training

### Tactical & Specialty
- Jungle Mobility
- Small Team Rescue
- Firefighter Survival Training

**Removed from old sites:** PPE Inspection Services, Tower & Aerial Tramway Rescue.

---

## Instructor Team

All 16 instructors from both sites unified into one team page.

**Lead Instructors:** Micah Rush, Eric Christensen, Tye Herron, Toph Steinhoff, Cody Carroll, Nadav Oakes, Dylan Reed
**Specialized Leads:** Jon Bertsch, Cody Parke, Kooper Adams, Tyler Anderson, Brent Roth
**Aerial Evacuation Leads:** Connor Greene, Gray Grandy, Erica Pacal, D'Arcy McLeish, Greg Cartier

---

## Data Model

```
profiles
  id (→ Supabase auth.users)
  role: admin | instructor | student
  full_name, avatar_url, created_at

-- Marketing content (CMS-lite, admin-managed)

services
  id, slug, title, description
  category: mountain | water | urban | tactical
  body (rich text / MDX)
  featured_image_url
  order

instructors
  id, slug, full_name, bio
  avatar_url, certifications (text[])
  specialties (text[]), years_experience
  order

blog_posts
  id, slug, title, body
  published_at, author_id → profiles
  featured_image_url

-- LMS

courses
  id, slug, title, description
  price (0 = free)
  instructor_id → profiles
  service_id → services (optional link to a service page)
  drive_folder_id
  published: boolean
  created_at

course_modules
  id, course_id, title, order

course_items
  id, module_id, order
  type: video | doc | text
  title
  youtube_url (if video)
  drive_file_id (if doc/PDF)
  created_at

enrollments
  id
  user_id → profiles
  course_id → courses
  stripe_session_id (null if free)
  enrolled_at

progress
  id
  user_id → profiles
  course_item_id → course_items
  completed_at

notifications
  id
  user_id → profiles
  course_id → courses
  course_item_id → course_items
  message
  read: boolean
  created_at

drive_sync_log
  id
  course_id → courses
  drive_file_id
  file_name
  detected_at
  notified_at
```

---

## Google Drive Integration

### Concept
- One shared Google Drive folder tree (admin-controlled, instructors can add to subfolders)
- Site uses a **service account** with read access — no OAuth needed for students
- Each course is linked to a specific Drive folder (`drive_folder_id` on course)
- Students never interact with Drive — they see a clean UI on the site

### Folder Structure (suggested)
```
Peak Rescue (root)
  └── Course Name
        ├── Module 1 - Introduction
        │     ├── handout.pdf
        │     └── waiver-template.docx
        └── Module 2 - Techniques
              └── reference-guide.pdf
```

### Content Notification System
When an instructor adds a file to a course folder, enrolled students are automatically notified.

**Implementation — polling approach:**
1. Cron job runs every hour via Vercel Cron
2. For each course, fetches files from the linked Drive folder via Google Drive API
3. Compares against `drive_sync_log` — any file not already logged is "new"
4. Logs new files to `drive_sync_log`
5. On first detection: looks up all enrolled students for that course, sends email to each
6. Also creates a `notifications` row per student for in-app display

---

## Instagram Gallery

- Instagram account must be a **Business or Creator** account, connected to a Facebook Page
- Meta Developer app with Instagram Graph API access
- Long-lived access token stored as env variable
- On gallery page load, fetch recent media via Instagram Graph API
- Cache response (Next.js `revalidate: 3600`) — refreshes hourly
- Display as masonry/grid layout, each photo links to the original post
- Vercel Cron job refreshes token every 60 days automatically

---

## Payment Flow

- **Free courses**: Student clicks "Enroll" → enrollment row created → redirects to `/courses/[slug]/learn`
- **Paid courses**: Stripe Checkout → webhook at `/api/webhooks/stripe` → enrollment row created → confirmation email with magic link

---

## Email Notifications (Resend)

| Trigger | Recipient | Content |
|---|---|---|
| Purchase complete | Student | Confirmation + magic link to access course |
| New content added | Enrolled students | "New material in [Course]" + link |
| Instructor added to course | Instructor | Welcome + course link |
| (optional) New enrollment | Instructor | "[Student] enrolled in [Course]" |

---

## Build Order

### Phase 0 — Marketing Site Foundation (replaces both existing sites)
- [ ] Repo + Next.js scaffold (Tailwind, Supabase client, Vercel config)
- [ ] Homepage: hero, services category grid, instructor strip, IG preview, contact CTA
- [ ] Services section: all 14 programs, filterable by category
- [ ] Instructors section: all 16 profiles, individual pages
- [ ] Blog: port 4 existing articles, support new posts
- [ ] Contact page
- [ ] Mobile responsiveness + SEO basics

### Phase 1 — Auth Foundation
- [ ] Auth with roles (magic link, role-based redirects)
- [ ] Profiles table + role assignment

### Phase 2 — Course Structure
- [ ] Courses, modules, course items data model
- [ ] Admin UI: create/edit courses and modules
- [ ] Public course listing + detail pages

### Phase 3 — Enrollment + Payments
- [ ] Free enrollment flow
- [ ] Stripe checkout + webhook
- [ ] Post-purchase email (Resend)
- [ ] Student content viewer (`/courses/[slug]/learn`)
- [ ] Progress tracking (per-item completion checkboxes)

### Phase 4 — Google Drive Integration
- [ ] Service account setup + Drive API credentials
- [ ] Link Drive folder to a course (admin UI)
- [ ] File listing from Drive on course pages
- [ ] PDF/doc viewer embedded in content viewer

### Phase 5 — Notifications
- [ ] `drive_sync_log` and `notifications` tables
- [ ] Vercel Cron job — hourly Drive folder polling
- [ ] New file detection → email enrolled students
- [ ] In-app notification bell on student dashboard

### Phase 6 — Instructor Dashboard
- [ ] Instructor course management view
- [ ] Enrolled student list per course
- [ ] Ability to add/reorder modules and items

### Phase 7 — Instagram Gallery
- [ ] Meta Developer app setup
- [ ] Gallery page with cached IG feed
- [ ] Token auto-refresh cron job

### Phase 8 — Polish
- [ ] Loading states, error handling
- [ ] SEO (course pages)
- [ ] Analytics

### Phase 9 — Store (future, TBD)
- [ ] Decision: integrate elevatedsafety.com gear shop, or build direct sales
- [ ] If direct: Stripe product catalog, inventory management
- [ ] If linked: affiliate/referral links to elevatedsafety.com product pages

---

## Environment Variables Needed

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Google Drive
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=

# Instagram
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=

# Resend
RESEND_API_KEY=

# Site
NEXT_PUBLIC_SITE_URL=
```

---

## Key Decisions & Notes

- **Brand**: Peak Rescue is the primary brand. "Peak Rescue Mountain Guides" is DBA for mountain guiding programs only.
- **Services vs. Courses**: Services are marketing/booking pages (contact to book). Courses are LMS learning content with enrollment + payments. A service can optionally link to a course.
- **Scheduling**: Booking/calendar stays external (elevatedsafety.com) for now. Services pages have a contact CTA, not a built-in scheduler.
- **Gallery**: Instagram feed replaces the static galleries on both sites. No manual image maintenance.
- **Store**: Deferred to Phase 9. For now, gear links point to elevatedsafety.com.
- **Auth**: Token hash magic links (not PKCE) — avoids cross-origin cookie issues.
- **Video paywall**: `youtube-nocookie.com` + transparent overlay blocking share button.
- **Drive access**: Service account reads folders — students never need Google auth.
- **Webhook URL**: Must use the canonical `www.` domain — Stripe doesn't follow redirects.
- **Supabase keys**: Use legacy JWT format (`eyJ...`), not new `sb_` format.
- **SSH**: Repo cloned via SSH key at `~/.ssh/id_ed25519_peak_rescue`.
