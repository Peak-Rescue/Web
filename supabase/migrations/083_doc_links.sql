-- Document attachments can now be external links (Google Drive, Dropbox,
-- CalTopo…) as well as uploaded files. A row is either an upload (path into
-- the private task-documents bucket) or a link (url), never both.

alter table public.course_documents alter column path drop not null;
alter table public.course_documents add column if not exists url text;
alter table public.course_documents drop constraint if exists course_documents_path_or_url;
alter table public.course_documents add constraint course_documents_path_or_url
  check ((path is null) <> (url is null));

alter table public.course_task_documents alter column path drop not null;
alter table public.course_task_documents add column if not exists url text;
alter table public.course_task_documents drop constraint if exists course_task_documents_path_or_url;
alter table public.course_task_documents add constraint course_task_documents_path_or_url
  check ((path is null) <> (url is null));
