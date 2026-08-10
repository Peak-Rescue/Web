-- Bring the slugs that drifted back in line with their courses.
--
-- Slugs were written once at creation and never again, so any course whose
-- type, client, location or dates changed afterwards kept describing what it
-- used to be. The code now regenerates on save; this catches the four that
-- already drifted, since nothing would otherwise touch them until someone
-- happened to open and save each one.
--
-- Data only — nothing resolves by slug, so this is safe against any deployed
-- version of the app.
--
-- Matched on the exact current value, which makes it idempotent and means it
-- declines to act on anything that has moved since this was written.

-- Was created as mountain mobility training, now swift water and mountain
-- rescue, and the location gained its second candidate.
update public.course_instances
set slug = 'swift-water-and-mountain-rescue-48-rqs-jackson-hole-wy-or-tucson-az'
where ref_number = 8
  and slug = 'mountain-mobility-training-48-rqs-jackson-hole-wyoming';

-- Created as jungle mobility, recategorised to canyoneering.
update public.course_instances
set slug = 'canyoneering-10-maui-2026-08-24'
where ref_number = 11
  and slug = 'jungle-mobility-131-rqs-maui-2026-08-24';

-- Location gained "or Capitol Reef".
update public.course_instances
set slug = 'canyoneering-24-sts-saint-george-ut-or-capitol-reef-2026-09-14'
where ref_number = 13
  and slug = 'canyoneering-24-sts-saint-george-ut-2026-09-14';

-- The -1 was a real collision suffix once, but whatever held the base slug no
-- longer does, so it can have it back.
update public.course_instances
set slug = 'aerial-tramway-rescue-tnt-and-darcy-calgary-canada-2026-11-10'
where ref_number = 46
  and slug = 'aerial-tramway-rescue-tnt-and-darcy-calgary-canada-2026-11-10-1'
  and not exists (
    select 1 from public.course_instances o
    where o.slug = 'aerial-tramway-rescue-tnt-and-darcy-calgary-canada-2026-11-10'
  );

-- Deliberately untouched: PR-0050 keeps its -1. PR-0049 is the same jungle
-- mobility course for MARSOC in Oahu on the same date, and holds the base
-- slug — that suffix is doing its job.
--
-- Also untouched: the 29 courses whose slug is null. Nothing reads a slug, so
-- minting labels that never existed is a bigger change than fixing wrong ones.
-- They will get one the next time each course is saved.
