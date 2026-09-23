-- Mountain is its own skill again.
--
-- 088 collapsed the military skills into their civilian twins and mapped
-- mil_mountain to backcountry. Mountain had no civilian twin to go to.
-- Backcountry, in the civilian SAR sense, is rescue in backcountry terrain,
-- and its military counterpart is small team rescue — which kept its own
-- entry. Mountain is the other thing entirely: mountaineering and climbing
-- mobility, moving a team through the terrain rather than getting someone out
-- of it. Since 088 one sign-off has meant both, so anyone cleared to teach a
-- SAR backcountry course also counted as qualified to run Mountain Mobility.
--
-- Who holds which, and which material belongs to which, was sorted by the
-- admin course by course; this writes that pass down.

-- ─── Expertise ──────────────────────────────────────────────────────────────

insert into public.instructor_capabilities (instructor_id, category, role)
select id, 'mountain', 'lead' from public.instructors
where name in ('Eric Christensen', 'Micah Rush', 'Nadav Oakes', 'Toph Steinhoff')
on conflict (instructor_id, category) do update set role = excluded.role;

insert into public.instructor_capabilities (instructor_id, category, role)
select id, 'mountain', 'assist' from public.instructors
where name in ('Cody Carroll', 'Dustin Fiero', 'Dylan Reed', 'Kevin Carey', 'Matthew Legler', 'Sean Herlihy')
on conflict (instructor_id, category) do update set role = excluded.role;

-- Two military-only instructors whose backcountry row was never civilian
-- rescue: it was mil_mountain all along, so it moves rather than doubles.
delete from public.instructor_capabilities
where category = 'backcountry'
  and instructor_id in (
    select id from public.instructors where name in ('Cody Carroll', 'Kevin Carey')
  );

-- ─── Courses ────────────────────────────────────────────────────────────────

-- The blanket tag set 086 handed every military course: one of those nine was
-- mil_mountain, so mountain goes back on. Courses tagged backcountry
-- deliberately — the ITRA/ITRS work, PR-0008 — are left alone.
update public.course_instances
set custom_categories = custom_categories || array['mountain']
where custom_categories @> array['aerial_evac', 'backcountry', 'canyoning', 'cold_weather',
                                 'jungle_mobility', 'maritime', 'small_team', 'swift_water',
                                 'urban_mobility']
  and not custom_categories @> array['mountain'];

-- ─── Library ────────────────────────────────────────────────────────────────

-- Mountain mobility material: the Basic Mountain Operator program.
update public.library_items
set disciplines = array_append(array_remove(disciplines, 'backcountry'), 'mountain')
where id in (
  'd4769876-4a46-4488-b102-1a3d1281149d',  -- 2024_12 PRMG Basic Mountain Operator Schedule
  '3c355218-1832-4269-be14-5102a8cc61ae',  -- AF-A3S_MNTL_QTP (A3S signed) leader.pdf
  'b2eabba6-d768-425d-b4eb-109cc51c8710',  -- AF-A3S_MNTO_QTP (A3S signed).pdf
  'b551ca12-d4d9-4bb5-8e30-91efb004e5df',  -- Ascend a Rope.docx
  '9677287b-00bc-4ce2-9ed4-207115d355d8',  -- Basic Mountain Operator (CalTopo)
  'ecc1f6f4-4024-4102-96e4-f623fff6eb3a',  -- Basic Mountain Operator Course Gear List
  '1942bc18-58aa-4232-bed7-ee9ab64d1bc7',  -- Basic Mountain Operator Instructor Manual
  'd9745ef6-eeac-4607-ab21-1e852c47414b',  -- Belay Techniques (ATC).docx
  '73ee67ae-e611-44a0-8669-6778f2e9176d',  -- Belay Techniques (Munter Hitch).docx
  '170c991c-0871-44a5-ae05-1059b9ed747a',  -- BMO Log Book
  'b7bd3543-0d8c-408f-9f7e-95397a26f7f3',  -- Butterfly coil.docx
  '30b99ad7-06b3-405e-8bb7-b9495b0b4913',  -- CMS Logbook (3) (edited).pdf
  '9389a161-4e70-4207-ae94-5204bd2d6569',  -- Construct Natural Anchor.docx
  'babc685b-7712-406c-9fa7-0cdf1aeb557f',  -- Don a manufactured climbing harness and construct a Swiss Seat.docx
  '0956aff8-d140-4b33-b655-15bf47ec8fdd',  -- Meadowlark Area (BMO) - CalTopo
  'ee8bdc3d-0ef2-4e04-82a1-1b22c584d1ec',  -- Mountain Mobility Handbook
  'fb47f9a2-1e80-4acb-aa83-b7f3c7b1e733',  -- Mountain Nav&Weather - Support Document
  '86ba35fc-2409-416d-9be4-bc1cd24f1a23',  -- Mountain Navigation-PEAK.pptx
  'd621e22b-7f5d-45a8-98ab-8993d156f61a',  -- Negotiate a Fixed Line.docx
  '29cb4c7e-1baa-4706-b135-6a50e3958e92',  -- PRMG Summer Basic Mountain Operator Schedule Ten Sleep
  'cb68ab6a-6a4f-4551-884c-d43fc74b4c5f',  -- PRMG Summer Basic Mountain Operator Schedule.pdf
  'b24ca221-aee5-46a9-b1d3-527d2aa73f18',  -- Ramsbottom.pptx
  'c5115ae1-f3cc-4dd2-83ce-7662cec43bcb',  -- Tie Mountaineering Knots.docx
  '4bd07aa3-acc4-4c97-b15a-47a05c1ba9d2',  -- Understand and Employ Rappelling Techniques.docx
  '3333bd02-7a81-4189-95a2-a086d9e17d1e'  -- USASOC Regulation 350-12 SIGNED 5 NOV 2021.pdf
);

-- Both: written for backcountry rescue, but the skill is mountaineering.
update public.library_items
set disciplines = array_append(disciplines, 'mountain')
where id in (
  '67cac065-1829-4aa6-886d-cf726767ab9c',  -- Copy of Alpine EndorsementJPR's.pdf
  '1df73e81-7ee1-4d2c-aa79-e6706adfef6b',  -- FortiniSNOWANCHORS3B.pdf.pdf
  '381908ce-a55c-4e90-babb-462302c21bbb',  -- Handbook_EN_UIAA-SL-Phil_Online_Small.pdf
  '48bbcb80-3d0c-4839-8395-a41dea4e630b'  -- ISSW_O-061.pdf
);

-- Neither: forms and handbooks that belong to no discipline in particular,
-- or to one they already carry.
update public.library_items
set disciplines = array_remove(disciplines, 'backcountry')
where id in (
  'cbcc3144-b85c-46c0-be38-5ca41c8a661c',  -- Employee Handbook
  '419a0991-03e4-4284-a2af-6d74f2a5c3d4',  -- Jungle Mobility - Student Equipment List
  '6c065c90-58aa-483b-ae91-38edd2803d29',  -- Copy of 5 Day Class Roster
  '2e4d1279-946a-41a8-ba7f-71ff145aafcb',  -- Daily Risk Eval/Evac Plan
  '5da5395b-6fe8-4d87-a4b5-9e063f8f1c84'  -- Elevated Safety - Release of Liability and Assumption of Risk (1)
);
