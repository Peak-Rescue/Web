-- Exempt is its own question after all.
--
-- 200 folded it into the salary, on the evidence of the two salaried people
-- then on file: both were exempt, so being on a salary looked like what
-- exemption meant. It is not. Eric, Toph and Cody are salaried and still earn
-- the overtime premium; only Nadav is salaried and exempt from it. Collapsing
-- the two would have quietly stopped paying three people time and a half.
--
-- So the three questions stand apart, and each is asked once:
--
--   · salaried       — whether there is a salary (with annual_salary beside
--                      it, for the org's own P&L; no course reads it).
--   · paid_for_days  — whether the field and travel days they work are paid
--                      on top. What a course's pay lines read.
--   · is_exempt      — whether the overtime premium is theirs, and whether
--                      they can claim covered meals without receipts (039).
--                      On the account, set by hand again.
--
-- Nothing derives from anything else here, because each of the four people
-- this is about answers them in a different combination.

-- Stop is_exempt being a copy of the salary, and set what is actually true.
-- Named by slug: these are four specific people, and a rule that picked them
-- out by some other column would be a rule nobody agreed to.

-- Salaried, paid the day rates, and still earning the premium.
update public.instructors set salaried = true, paid_for_days = true
  where slug in ('eric-christensen', 'toph-steinhoff');

-- Salaried, and his salary covers the days he works.
update public.instructors set salaried = true, paid_for_days = false
  where slug = 'cody-carroll';

-- Only the premium is not theirs, and only for Nadav. Everyone else linked to
-- a roster row keeps whatever their account already said, except the three
-- above, whose accounts 200 marked exempt on the strength of the salary.
update public.profiles p
  set is_exempt = false
  from public.instructors i
  where i.profile_id = p.id
    and p.is_exempt
    and i.slug in ('eric-christensen', 'toph-steinhoff', 'cody-carroll');

comment on column public.instructors.salaried is
  'Whether they are on a salary. Independent of both the other pay questions: salaried people can still be paid for course days (paid_for_days) and can still earn the overtime premium (profiles.is_exempt).';

comment on column public.profiles.is_exempt is
  'FLSA exempt: no overtime premium on course hours, and covered meals claimable without receipts. Set by hand on the instructor page — it does not follow from being on a salary, which three of the salaried crew disprove.';

-- What the four look like now, so the numbers can be checked against what
-- somebody meant rather than against what the code happened to do.
do $$
declare r record;
begin
  for r in
    select i.name, i.salaried, i.paid_for_days, coalesce(p.is_exempt, false) as exempt
    from public.instructors i
    left join public.profiles p on p.id = i.profile_id
    where i.salaried or coalesce(p.is_exempt, false)
    order by i.name
  loop
    raise notice '% — salaried %, paid for days %, exempt %', r.name, r.salaried, r.paid_for_days, r.exempt;
  end loop;
end $$;
