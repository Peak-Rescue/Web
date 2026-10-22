-- Half the written-down gear lists are a link to a Google Doc, and there was
-- nowhere to put it: the structured tables hold rows, not links, so a link
-- went into the note — which is why the shelf showed a sentence under one row
-- and a raw URL under the next.
--
-- Same column a library item has, for the same reason. The note goes back to
-- being a note.
do $$
declare t text;
begin
  foreach t in array array['gear_lists', 'course_schedules', 'course_templates'] loop
    execute format('alter table public.%I add column if not exists url text', t);
    -- A description that is nothing but a link was somebody filling in the
    -- only box there was.
    execute format($f$
      update public.%I
      set url = trim(description), description = null
      where url is null
        and description is not null
        and trim(description) ~ '^https?://[^[:space:]]+$'
    $f$, t);
  end loop;
end $$;
