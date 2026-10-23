-- A contact was stored inside whatever owned it: venues.contacts,
-- region_info.contacts, clients.contacts, each a JSON array. That was right
-- while a person belonged to exactly one place, and stopped being right the
-- moment they could belong to a client and a venue at once — filing somebody
-- with both wrote them twice, the list honestly showed two of them, and
-- correcting a number on one left the other wrong.
--
-- So: one row per person, and a link saying where they are known from. Two
-- links, one person. Editing is one edit.
--
-- The course's own place_contacts stays a copy on purpose: the person a
-- given course deals with is often a name for that week, and editing it must
-- not rewrite the venue for every other course that goes there.
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  role       text,
  phone      text,
  email      text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Where a person is known from. Exactly one of the three, so a link is a
-- fact about one owner rather than a row that half-answers three questions.
create table if not exists public.contact_links (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  venue_id    uuid references public.venues(id) on delete cascade,
  region_code text,
  created_at  timestamptz not null default now(),
  constraint contact_links_one_owner check (
    (client_id is not null)::int + (venue_id is not null)::int + (region_code is not null)::int = 1
  )
);

create unique index if not exists contact_links_client_uniq
  on public.contact_links (contact_id, client_id) where client_id is not null;
create unique index if not exists contact_links_venue_uniq
  on public.contact_links (contact_id, venue_id) where venue_id is not null;
create unique index if not exists contact_links_region_uniq
  on public.contact_links (contact_id, region_code) where region_code is not null;
create index if not exists contact_links_contact_idx on public.contact_links (contact_id);

drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- The three arrays, folded in. A person already written to two owners becomes
-- one row with two links: matched on the name and whichever of the number or
-- the address they were written with, which is how a human would tell.
do $$
declare
  owner record;
  person jsonb;
  key text;
  found uuid;
begin
  for owner in
    select 'client' as kind, id::text as ref, contacts from public.clients where jsonb_array_length(coalesce(contacts, '[]'::jsonb)) > 0
    union all
    select 'venue', id::text, contacts from public.venues where jsonb_array_length(coalesce(contacts, '[]'::jsonb)) > 0
    union all
    select 'region', region_code, contacts from public.region_info where jsonb_array_length(coalesce(contacts, '[]'::jsonb)) > 0
  loop
    for person in select * from jsonb_array_elements(owner.contacts) loop
      key := lower(trim(coalesce(person->>'name', '')));
      continue when key = '';

      select c.id into found
      from public.contacts c
      where lower(trim(c.name)) = key
        and (
          coalesce(nullif(person->>'phone', ''), '') = coalesce(c.phone, '')
          or coalesce(nullif(person->>'email', ''), '') = coalesce(c.email, '')
          or (coalesce(person->>'phone', '') = '' and coalesce(person->>'email', '') = '')
        )
      limit 1;

      if found is null then
        insert into public.contacts (name, role, phone, email, note)
        values (
          trim(person->>'name'),
          nullif(person->>'role', ''),
          nullif(person->>'phone', ''),
          nullif(person->>'email', ''),
          nullif(person->>'note', '')
        )
        returning id into found;
      end if;

      insert into public.contact_links (contact_id, client_id, venue_id, region_code)
      values (
        found,
        case when owner.kind = 'client' then owner.ref::uuid end,
        case when owner.kind = 'venue' then owner.ref::uuid end,
        case when owner.kind = 'region' then owner.ref end
      )
      on conflict do nothing;
    end loop;
  end loop;
end $$;
