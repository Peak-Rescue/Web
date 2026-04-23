create policy "profiles: insert own"
  on profiles for insert
  with check (auth.uid() = id);
