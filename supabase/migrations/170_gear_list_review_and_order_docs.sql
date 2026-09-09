-- A second pair of eyes on a gear list, and paperwork on a gear order.
--
-- ── Review ──────────────────────────────────────────────────────────────
-- A list goes out to students and to a client, and the person who assembled
-- it is usually the only one who has read it. Asking the crew to look meant
-- writing an update saying "please look at the gear list", which lands in a
-- feed, points at nothing in particular, and leaves nowhere to answer — so
-- there was no way to tell whether anyone actually did.
--
-- Four columns, which is the whole state: who was asked and when, and who
-- signed it off and what they said. Asked with no sign-off is outstanding;
-- both set is done; a list edited after a sign-off is a question again, which
-- the code works out from updated_at rather than storing a fifth column.
alter table public.gear_lists
  add column if not exists review_requested_at  timestamptz,
  add column if not exists review_requested_by  uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at          timestamptz,
  add column if not exists reviewed_by          uuid references public.profiles(id) on delete set null,
  add column if not exists review_note          text;

comment on column public.gear_lists.review_requested_at is
  'When the crew was last asked to look at this list.';
comment on column public.gear_lists.reviewed_at is
  'When an instructor last signed it off. Older than updated_at means the list has changed since.';

-- ── Order paperwork ─────────────────────────────────────────────────────
-- A quote, a spec sheet, a signed agreement: the things that travel with an
-- order and are not lines on it. Same shape the course updates use for their
-- attachments — a path in the private bucket and the name to show — so the
-- signing and the cleanup already know what to do with it.
alter table public.gear_orders
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.gear_orders.attachments is
  'Files sent with the order: [{ path, filename }] in the task-documents bucket.';
