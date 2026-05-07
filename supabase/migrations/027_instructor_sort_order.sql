-- ─── Add sort_order to instructors ───────────────────────────────────────────

alter table instructors
  add column sort_order integer;

-- Row 1: Micah, Toph, Eric Christensen, Cody Carroll
-- Row 2 starts: Nadav
update instructors set sort_order = 1 where slug = 'micah-rush';
update instructors set sort_order = 2 where slug = 'toph-steinhoff';
update instructors set sort_order = 3 where slug = 'eric-christensen';
update instructors set sort_order = 4 where slug = 'cody-carroll';
update instructors set sort_order = 5 where slug = 'nadav-oakes';
