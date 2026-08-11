-- One text field per level, and neither starts with inherited words.
--
-- The catalog carried two: `info` ("Ascending fixed lines") and `recommended`
-- ("Mountaineering or canyoning rated"). 109 moved both onto the list entry on
-- the premise that they were per-course, which turned out to be true of two of
-- the eleven specs — the rest were standing requirements. But none of that text
-- is being kept: it is imported wording nobody chose, and it will be rewritten
-- deliberately from here.
--
-- So the columns that duplicate the entry's note go, `info` stays as the one
-- catalog description, and it starts empty.

alter table public.gear_list_entries drop column if exists info;
alter table public.gear_list_entries drop column if exists recommended;
alter table public.gear_items drop column if exists recommended;

-- Kept, emptied. The field is wanted; the words in it are not.
update public.gear_items set info = null where info is not null;

comment on column public.gear_items.info is
  'What this gear is and how we specify it — a property of the item, true on every course. Per-course wording belongs on gear_list_entries.note.';
