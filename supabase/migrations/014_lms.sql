-- ─── Tables first (no cross-references in definitions) ───────────────────────

create table courses (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  created_at  timestamptz not null default now()
);

create type instance_status as enum ('tentative', 'confirmed', 'completed', 'cancelled');

create table course_instances (
  id                      uuid primary key default gen_random_uuid(),
  course_id               uuid references courses on delete set null,
  status                  instance_status not null default 'tentative',
  title                   text not null,
  starts_at               date,
  ends_at                 date,
  location                text,
  client_name             text,
  contact_name            text,
  contact_phone           text,
  contact_email           text,
  notes                   text,
  max_students            integer,
  instructor_slots        integer,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create type instructor_instance_role as enum ('lead', 'assist');

create table instance_instructors (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references course_instances on delete cascade,
  instructor_id  uuid not null references profiles on delete cascade,
  role           instructor_instance_role not null default 'assist',
  unique (instance_id, instructor_id)
);

create table enrollments (
  id                uuid primary key default gen_random_uuid(),
  instance_id       uuid not null references course_instances on delete cascade,
  user_id           uuid not null references profiles on delete cascade,
  stripe_session_id text,
  enrolled_at       timestamptz not null default now(),
  unique (instance_id, user_id)
);

create type module_audience as enum ('student', 'instructor', 'both');

create table course_modules (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references course_instances on delete cascade,
  title        text not null,
  audience     module_audience not null default 'both',
  "order"      integer not null default 0,
  created_at   timestamptz not null default now()
);

create type item_type as enum ('video', 'doc', 'link');

create table course_items (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references course_modules on delete cascade,
  title       text not null,
  type        item_type not null,
  url         text not null,
  description text,
  "order"     integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ─── Triggers ─────────────────────────────────────────────────────────────────

create trigger course_instances_updated_at
  before update on course_instances
  for each row execute procedure set_updated_at();

-- ─── RLS (all tables created, safe to cross-reference) ───────────────────────

alter table courses enable row level security;
alter table course_instances enable row level security;
alter table instance_instructors enable row level security;
alter table enrollments enable row level security;
alter table course_modules enable row level security;
alter table course_items enable row level security;

-- courses
create policy "courses: admin full access"
  on courses for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "courses: instructors read"
  on courses for select
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'instructor')));

-- course_instances
create policy "instances: admin full access"
  on course_instances for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "instances: assigned instructors read"
  on course_instances for select
  using (
    exists (
      select 1 from instance_instructors
      where instance_id = course_instances.id
        and instructor_id = auth.uid()
    )
  );

create policy "instances: enrolled students read"
  on course_instances for select
  using (
    exists (
      select 1 from enrollments
      where instance_id = course_instances.id
        and user_id = auth.uid()
    )
  );

-- instance_instructors
create policy "instance_instructors: admin full access"
  on instance_instructors for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "instance_instructors: instructors read own"
  on instance_instructors for select
  using (instructor_id = auth.uid());

-- enrollments
create policy "enrollments: admin full access"
  on enrollments for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "enrollments: students read own"
  on enrollments for select
  using (user_id = auth.uid());

create policy "enrollments: assigned instructors read"
  on enrollments for select
  using (
    exists (
      select 1 from instance_instructors
      where instance_id = enrollments.instance_id
        and instructor_id = auth.uid()
    )
  );

-- course_modules
create policy "modules: admin full access"
  on course_modules for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "modules: assigned instructors read all"
  on course_modules for select
  using (
    exists (
      select 1 from instance_instructors
      where instance_id = course_modules.instance_id
        and instructor_id = auth.uid()
    )
  );

create policy "modules: enrolled students read student+both"
  on course_modules for select
  using (
    audience in ('student', 'both')
    and exists (
      select 1 from enrollments
      where instance_id = course_modules.instance_id
        and user_id = auth.uid()
    )
  );

-- course_items
create policy "items: admin full access"
  on course_items for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "items: instructors read via module"
  on course_items for select
  using (
    exists (
      select 1
      from course_modules m
      join instance_instructors ii on ii.instance_id = m.instance_id
      where m.id = course_items.module_id
        and ii.instructor_id = auth.uid()
    )
  );

create policy "items: students read via enrollment + audience"
  on course_items for select
  using (
    exists (
      select 1
      from course_modules m
      join enrollments e on e.instance_id = m.instance_id
      where m.id = course_items.module_id
        and e.user_id = auth.uid()
        and m.audience in ('student', 'both')
    )
  );
