-- A note belongs to the course, not to the catalog.
--
-- The catalog carried two free-text fields — `info` ("what it's for") and
-- `recommended` ("the spec we suggest") — and every list inherited whichever
-- of them the entry hadn't overridden. That was backwards. "At least 4 spare",
-- "Plus spare batteries", "With a warm base layer", "4/3mm for swiftwater
-- canyoning" are all answers to *this course, in these conditions*, and the
-- catalog is the one place that doesn't know which course is asking. Written
-- there, the note went out on every list whether it was true of that course or
-- not, and the only way to say something different was to override a field
-- the editor had no UI for.
--
-- So the note moves to the entry, where it is written per course, and the
-- catalog goes back to saying only what a piece of gear *is* — its name, its
-- brand, what it's called, what kind it is, what it's for, and the products
-- that satisfy it.
--
-- And it becomes one field rather than two. 102 already had to untangle `info`
-- from `recommended` where they had begun repeating each other; a pair of
-- free-text boxes with no line between them will always drift back together.
-- One box, printed as one line — exactly how both were already rendered.
--
-- Expand only. The columns being replaced stay until the app that reads them
-- is deployed; 110 drops them.

alter table public.gear_list_entries add column if not exists note text;

comment on column public.gear_list_entries.note is
  'What this course wants to say about this item — spec, quantity, condition. Written per list; the catalog holds no notes.';

-- Everything both fields currently say, on both levels, as the one line they
-- were already being rendered as. The entry wins over the catalog, which is
-- the precedence the app applied when reading them.
--
-- Guarded on `note is null` so a second run is a no-op rather than a rewrite
-- of notes edited since.
update public.gear_list_entries e
set note = s.merged
from (
  select
    e2.id,
    nullif(
      concat_ws(
        ' — ',
        nullif(trim(coalesce(e2.info, g.info, '')), ''),
        -- Only when it adds something. A handful of rows say the same thing in
        -- both fields, and "Mountaineering harness — Mountaineering harness"
        -- is the failure 102 was cleaning up, not a note.
        nullif(
          case
            when trim(coalesce(e2.recommended, g.recommended, '')) is not distinct from
                 trim(coalesce(e2.info, g.info, ''))
            then ''
            else trim(coalesce(e2.recommended, g.recommended, ''))
          end,
          ''
        )
      ),
      ''
    ) as merged
  from public.gear_list_entries e2
  left join public.gear_items g on g.id = e2.gear_item_id
) s
where s.id = e.id and e.note is null;
