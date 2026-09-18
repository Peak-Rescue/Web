-- Exempt was never a separate answer.
--
-- 039 put an FLSA exemption flag on the account, for per-diem eligibility on
-- expense reports; 195 read the same flag to decide whose hours earn the
-- overtime premium. Both are true of exactly the salaried crew, and nobody
-- here is one without being the other — so two toggles on the employment
-- section were one fact asked twice, with the standing invitation to answer
-- them differently and no way to tell which answer was meant.
--
-- So salaried is the question, and exemption is what it means. profiles
-- .is_exempt stays: expense reports read it, and an account is the right
-- place for a fact about per diem. It is now written from the roster row
-- rather than set by hand.
--
-- Nobody's exemption changes here. Somebody previously marked exempt is
-- recorded as salaried — which under this rule is what marking them exempt
-- was saying — and everyone's per-diem eligibility comes out exactly as it
-- went in.

update public.instructors i
  set salaried = true
  where not i.salaried
    and exists (select 1 from public.profiles p where p.id = i.profile_id and p.is_exempt);

update public.profiles p
  set is_exempt = i.salaried
  from public.instructors i
  where i.profile_id = p.id and p.is_exempt is distinct from i.salaried;

comment on column public.instructors.salaried is
  'Whether they are on a salary — which is also what FLSA exempt meant here, so it decides both per-diem eligibility (mirrored onto profiles.is_exempt) and whether their hours earn the overtime premium. It says nothing on its own about whether course days are paid: see paid_for_days.';

comment on column public.profiles.is_exempt is
  'FLSA exempt, for per-diem eligibility on expense reports. Mirrored from instructors.salaried rather than set by hand — being on a salary is what exemption meant here, and two places to answer it was two places to disagree.';
