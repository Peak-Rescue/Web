-- Storage RLS for cert-documents bucket (private)
-- Path structure: certs/{user_id}/{cert_type}.{ext}

create policy "cert-documents: own upload"
  on storage.objects for insert
  with check (
    bucket_id = 'cert-documents' and
    name like 'certs/' || auth.uid()::text || '/%'
  );

create policy "cert-documents: own read"
  on storage.objects for select
  using (
    bucket_id = 'cert-documents' and
    name like 'certs/' || auth.uid()::text || '/%'
  );

create policy "cert-documents: own update"
  on storage.objects for update
  using (
    bucket_id = 'cert-documents' and
    name like 'certs/' || auth.uid()::text || '/%'
  );

create policy "cert-documents: own delete"
  on storage.objects for delete
  using (
    bucket_id = 'cert-documents' and
    name like 'certs/' || auth.uid()::text || '/%'
  );

create policy "cert-documents: admin read all"
  on storage.objects for select
  using (
    bucket_id = 'cert-documents' and
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
