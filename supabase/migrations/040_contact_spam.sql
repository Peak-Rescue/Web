-- Spam flag for contact submissions. Flagged rows are still stored (so a
-- false positive is recoverable from the admin spam list) but skip the
-- email notification and the main admin inbox.

alter table public.contact_submissions
  add column if not exists spam boolean not null default false;
