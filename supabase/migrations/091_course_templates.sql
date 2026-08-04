-- Course templates: a named, reusable course shape.
--
-- Nadav's framing — mirror what Classroom already does, and let people either
-- take it as-is or customise. So a template is the section structure of a
-- Classroom class, holding REFERENCES to library items, never copies. Applying
-- one rebuilds that class's shape on a course with live links; editing the
-- library entry still updates every course using it.
--
-- Only classes with a genuine course shape become templates. The
-- reference-shaped classes (Documents / Manuals / References) are shelves, not
-- course structures — their material lives in the library and is browsed.

create table if not exists public.course_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  -- Offering this shape belongs to, when there is one; the default offered at
  -- course creation for that type.
  course_type  text,
  is_default   boolean not null default false,
  -- Where it came from, so a template can be traced back and re-derived.
  source_class text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.course_template_sections (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.course_templates(id) on delete cascade,
  title       text not null,
  audience    text not null default 'shared' check (audience in ('internal', 'shared')),
  sort_order  int not null default 0
);

create table if not exists public.course_template_items (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.course_template_sections(id) on delete cascade,
  item_id    uuid not null references public.library_items(id) on delete cascade,
  sort_order int not null default 0,
  unique (section_id, item_id)
);

create index if not exists course_templates_type_idx on public.course_templates (course_type);
create index if not exists template_sections_tpl_idx on public.course_template_sections (template_id);
create index if not exists template_items_section_idx on public.course_template_items (section_id);

alter table public.course_templates         enable row level security;
alter table public.course_template_sections enable row level security;
alter table public.course_template_items    enable row level security;

create policy "templates: admin"          on public.course_templates         for all using (public.is_admin());
create policy "template_sections: admin"  on public.course_template_sections for all using (public.is_admin());
create policy "template_items: admin"     on public.course_template_items    for all using (public.is_admin());
