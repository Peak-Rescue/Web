-- Profiles (extends Supabase auth.users)
create type user_role as enum ('admin', 'instructor', 'student');

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        user_role not null default 'student',
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

-- Users can read their own profile; admins can read all
create policy "profiles: own read"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: admin read all"
  on profiles for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "profiles: own update"
  on profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── Instructor capabilities (internal — lead/assistant per course area) ───

create type capability_area as enum (
  'aerial_evac', 'canyoning', 'swiftwater', 'backcountry',
  'confined_space', 'military', 'industry', 'rope_access'
);

create type capability_role as enum ('lead', 'assistant');

create table instructor_capabilities (
  id             uuid primary key default gen_random_uuid(),
  instructor_id  uuid not null references profiles on delete cascade,
  area           capability_area not null,
  role           capability_role not null,
  unique (instructor_id, area)
);

alter table instructor_capabilities enable row level security;

create policy "capabilities: instructors read own"
  on instructor_capabilities for select
  using (instructor_id = auth.uid());

create policy "capabilities: admin full access"
  on instructor_capabilities for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ─── Instructor certifications (external — with levels and expiry) ───

create type cert_type as enum (
  'cpr', 'wfr', 'emt', 'other_ems',
  'amga_rock', 'amga_alpine', 'amga_ski',
  'sprat', 'avy', 'lnt', 'other'
);

create table instructor_certs (
  id             uuid primary key default gen_random_uuid(),
  instructor_id  uuid not null references profiles on delete cascade,
  cert_type      cert_type not null,
  level          text,           -- e.g. "1"/"2"/"3", "apprentice"/"assistant"/"certified"
  expires_at     date,           -- null = no expiry
  document_url   text,
  notes          text,           -- for other_ems / other descriptions
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table instructor_certs enable row level security;

create policy "certs: instructors read own"
  on instructor_certs for select
  using (instructor_id = auth.uid());

create policy "certs: instructors insert own"
  on instructor_certs for insert
  with check (instructor_id = auth.uid());

create policy "certs: instructors update own"
  on instructor_certs for update
  using (instructor_id = auth.uid());

create policy "certs: admin full access"
  on instructor_certs for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Keep updated_at current
create or replace function set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger instructor_certs_updated_at
  before update on instructor_certs
  for each row execute procedure set_updated_at();
