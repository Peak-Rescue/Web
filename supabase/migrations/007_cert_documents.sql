-- Replace single document_url on instructor_certs with a dedicated documents table

create table instructor_cert_documents (
  id          uuid primary key default gen_random_uuid(),
  cert_id     uuid not null references instructor_certs on delete cascade,
  url         text not null,
  file_name   text,
  created_at  timestamptz not null default now()
);

alter table instructor_cert_documents enable row level security;

create policy "cert-docs: instructors read own"
  on instructor_cert_documents for select
  using (
    exists (select 1 from instructor_certs c where c.id = cert_id and c.instructor_id = auth.uid())
  );

create policy "cert-docs: admin full access"
  on instructor_cert_documents for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Migrate existing document_url values into the new table
insert into instructor_cert_documents (cert_id, url, file_name)
select id, document_url, 'document'
from instructor_certs
where document_url is not null;

-- Drop the now-redundant column
alter table instructor_certs drop column document_url;
