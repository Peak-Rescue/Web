-- Waivers, signed in the portal instead of on Smartwaiver.
--
-- The form was never the hard part. What Smartwaiver actually sold us was the
-- archive: a signed document you can produce years later and say "this is the
-- text they agreed to, and this is what we knew about who they were." Losing
-- that is how you end up with a waiver that doesn't hold. So the shape here is
-- built around reproducing a signature exactly, and everything else follows.
--
-- Three ideas, in order of how much they matter:
--
--   1. The body is versioned and immutable. A signature points at the version
--      it signed, never at "the current waiver". Editing the text publishes a
--      new version; old signatures keep rendering the old words forever.
--   2. A signature records how well we knew the signer. Someone signed into
--      the portal is not the same as a name typed on a public page off a QR
--      code, and a record that flattens the two can't be defended.
--   3. A signature is valid before it is attached to anyone. The person who
--      turns up on day one with no login still signs a real waiver; linking it
--      to an enrollment is bookkeeping that happens afterwards, possibly
--      weeks afterwards, and never blocks the signing.

-- ─── Templates and their versions ───────────────────────────────────────────

create table if not exists public.waiver_templates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  slug        text not null unique,
  -- What staff call it when picking one for a course.
  name        text not null,
  -- Which version a new signature gets. Null until something is published, so
  -- a half-written template can't be handed to a student by accident.
  current_version_id uuid,
  archived_at timestamptz
);

create table if not exists public.waiver_template_versions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  template_id  uuid not null references public.waiver_templates on delete cascade,
  version      int not null,
  -- The whole document: title, warning, preamble, numbered clauses with their
  -- lettered sub-items, where the initials block sits, the guardian notice and
  -- the e-signature consent. Structured rather than HTML so the same row
  -- renders the web form and the PDF and neither can drift from the other.
  body         jsonb not null,
  published_at timestamptz,
  published_by uuid references public.profiles on delete set null,
  unique (template_id, version)
);

-- Added separately because the two tables reference each other.
do $$ begin
  alter table public.waiver_templates
    add constraint waiver_templates_current_version_fk
    foreign key (current_version_id) references public.waiver_template_versions
    on delete restrict;
exception when duplicate_object then null;
end $$;

-- A published version is the thing signatures point at, so its text can never
-- move again. Edits go to a new version; that is the whole point of the table.
create or replace function public.waiver_version_is_immutable()
returns trigger language plpgsql as $$
begin
  if old.published_at is not null and new.body is distinct from old.body then
    raise exception 'Waiver version % is published — publish a new version instead of editing it', old.version;
  end if;
  return new;
end;
$$;

drop trigger if exists waiver_versions_immutable on public.waiver_template_versions;
create trigger waiver_versions_immutable
  before update on public.waiver_template_versions
  for each row execute function public.waiver_version_is_immutable();

-- ─── Which waiver a course uses ─────────────────────────────────────────────

alter table public.course_instances
  add column if not exists waiver_template_id uuid
    references public.waiver_templates on delete set null,
  -- The QR an instructor holds up. One per course rather than one per person,
  -- because it is shown from a phone at a tailgate, not emailed to someone.
  -- Rotatable: a screenshot of last month's course shouldn't still open.
  add column if not exists waiver_token uuid unique,
  add column if not exists waiver_token_expires_at timestamptz;

comment on column public.course_instances.waiver_token is
  'Public token behind the course QR code. Null until an admin generates one.';

-- ─── Signatures ─────────────────────────────────────────────────────────────

create table if not exists public.waiver_signatures (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  instance_id   uuid not null references public.course_instances on delete restrict,
  -- Never the template: the exact words that were on screen.
  version_id    uuid not null references public.waiver_template_versions on delete restrict,

  -- Who we think signed, and how much that is worth. 'authenticated' means
  -- they were signed into the portal as this profile. 'unverified' means a
  -- name and email typed on the public page — the same assurance Smartwaiver
  -- gave us, which is to say none, and the record says so rather than
  -- pretending otherwise.
  identity      text not null default 'unverified'
                  check (identity in ('authenticated', 'unverified')),
  source        text not null default 'portal'
                  check (source in ('portal', 'qr')),

  -- All three nullable on purpose. A waiver signed by someone with no account
  -- is complete and valid; these get filled in when we work out who they are.
  enrollment_id uuid references public.enrollments on delete set null,
  profile_id    uuid references public.profiles on delete set null,
  -- Lowercased signing email, kept even once linked. This is what lets a
  -- waiver find its person later: sign at the tailgate, get an invite the
  -- following week, and the waiver attaches itself on signup.
  claim_email   text not null,

  -- How the link above was arrived at, because "the system guessed from an
  -- email" and "an instructor who knows this course said so" are not the same
  -- claim, and only one of them is worth anything if the waiver is ever
  -- questioned. Null while the signature is still unattached.
  --
  -- 'email_exact' and 'name_exact' are both matched against the enrollments on
  -- this one course, never across all profiles — a shared full name on an
  -- eight-person roster is close to impossible, and across the whole system it
  -- is only a matter of time. Both refuse to fire on more than one candidate,
  -- or on a candidate who has already signed.
  link_method   text check (link_method in ('session', 'email_exact', 'name_exact', 'manual', 'claim_signup')),
  linked_at     timestamptz,
  linked_by     uuid references public.profiles on delete set null,

  -- Who signs, and for whom. 'adult' signs for themselves; 'guardian' signs
  -- for one minor, whose details sit in the minor_ columns.
  signer_role   text not null default 'adult'
                  check (signer_role in ('adult', 'guardian')),

  -- Participant — the person doing the course.
  first_name    text not null,
  middle_name   text,
  last_name     text not null,
  phone         text,
  date_of_birth date not null,

  -- Minor, when a guardian is signing. The participant columns above stay the
  -- minor's; these describe the adult putting their name to it.
  guardian_first_name  text,
  guardian_middle_name text,
  guardian_last_name   text,
  guardian_phone       text,
  guardian_dob         date,

  -- Address and emergency contact, as collected today.
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  postal_code   text,
  country       text,
  emergency_first_name   text,
  emergency_last_name    text,
  emergency_phone        text,
  emergency_relationship text,

  -- The marks themselves, as data URLs, in the row rather than in storage: a
  -- signature that can go missing independently of the record it belongs to is
  -- not evidence of anything.
  initials_image text,
  signature_image text not null,
  esign_consent  boolean not null,

  -- What we can say about the signing itself if it is ever questioned.
  signed_at     timestamptz not null default now(),
  ip_address    inet,
  user_agent    text,

  -- Rendered copy, emailed and downloadable. Regenerable from the row.
  pdf_path      text,

  -- Consent is the point; a row without it is not a waiver.
  constraint waiver_signatures_consented check (esign_consent),
  -- A guardian signature that doesn't say who the guardian is would be void.
  constraint waiver_signatures_guardian_named check (
    signer_role <> 'guardian'
    or (guardian_first_name is not null and guardian_last_name is not null and guardian_dob is not null)
  )
);

create index if not exists waiver_signatures_instance_idx
  on public.waiver_signatures (instance_id, signed_at desc);
create index if not exists waiver_signatures_enrollment_idx
  on public.waiver_signatures (enrollment_id);

-- Attached to someone means we can say how. The two move together or not at all.
do $$ begin
  alter table public.waiver_signatures
    add constraint waiver_signatures_link_explained check (
      (enrollment_id is null and profile_id is null) or link_method is not null
    );
exception when duplicate_object then null;
end $$;
-- Finding the waivers waiting for a person who hasn't signed up yet.
create index if not exists waiver_signatures_claim_idx
  on public.waiver_signatures (claim_email) where enrollment_id is null;

-- Everything one person has ever signed, across courses and across however
-- many email addresses they have used. This is what a returning client is:
-- someone whose details we already have, who should not be retyping a date of
-- birth and an emergency contact for the fourth time. It is also the index
-- that finds an old account when a familiar face signs at the tailgate under
-- an email we have never seen.
create index if not exists waiver_signatures_profile_idx
  on public.waiver_signatures (profile_id, signed_at desc);
create index if not exists waiver_signatures_email_idx
  on public.waiver_signatures (claim_email, signed_at desc);

-- Signing twice for one course is a correction, not a second waiver — but the
-- first one still happened, so nothing is deleted and the latest simply wins.
create index if not exists waiver_signatures_person_idx
  on public.waiver_signatures (instance_id, claim_email, signed_at desc);

-- A signed waiver is a record of a past event. The only things that may change
-- afterwards are who we have worked out it belongs to, and the rendered PDF.
create or replace function public.waiver_signature_is_immutable()
returns trigger language plpgsql as $$
begin
  if row(new.*) is distinct from row(old.*) then
    if (new.instance_id, new.version_id, new.signer_role, new.first_name, new.middle_name,
        new.last_name, new.date_of_birth, new.signature_image, new.initials_image,
        new.esign_consent, new.signed_at, new.ip_address, new.user_agent, new.identity,
        new.source, new.claim_email)
       is distinct from
       (old.instance_id, old.version_id, old.signer_role, old.first_name, old.middle_name,
        old.last_name, old.date_of_birth, old.signature_image, old.initials_image,
        old.esign_consent, old.signed_at, old.ip_address, old.user_agent, old.identity,
        old.source, old.claim_email)
    then
      raise exception 'A signed waiver cannot be altered — only linked to a person or re-rendered';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists waiver_signatures_immutable on public.waiver_signatures;
create trigger waiver_signatures_immutable
  before update on public.waiver_signatures
  for each row execute function public.waiver_signature_is_immutable();

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.waiver_templates enable row level security;
alter table public.waiver_template_versions enable row level security;
alter table public.waiver_signatures enable row level security;

-- Templates are readable by anyone signed in — you cannot sign a document you
-- are not allowed to read. Writing them is admin-only.
drop policy if exists "waiver_templates: read" on public.waiver_templates;
create policy "waiver_templates: read"
  on public.waiver_templates for select using (auth.uid() is not null);

drop policy if exists "waiver_templates: admin write" on public.waiver_templates;
create policy "waiver_templates: admin write"
  on public.waiver_templates for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "waiver_versions: read" on public.waiver_template_versions;
create policy "waiver_versions: read"
  on public.waiver_template_versions for select using (auth.uid() is not null);

drop policy if exists "waiver_versions: admin write" on public.waiver_template_versions;
create policy "waiver_versions: admin write"
  on public.waiver_template_versions for all using (public.is_admin()) with check (public.is_admin());

-- A signature carries a date of birth, a home address and an emergency
-- contact. Students see their own; the course team and admins see the course's
-- so they can check who is missing. Nobody else, and no writes through RLS —
-- signing goes through a server action that stamps IP and identity, which a
-- client-side insert could lie about.
drop policy if exists "waiver_signatures: own read" on public.waiver_signatures;
create policy "waiver_signatures: own read"
  on public.waiver_signatures for select
  using (profile_id = auth.uid());

drop policy if exists "waiver_signatures: course team read" on public.waiver_signatures;
create policy "waiver_signatures: course team read"
  on public.waiver_signatures for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = waiver_signatures.instance_id
        and i.profile_id = auth.uid()
    )
  );

grant select on public.waiver_templates, public.waiver_template_versions to authenticated;
grant select on public.waiver_signatures to authenticated;

-- ─── Seed: the waiver in use today, verbatim ────────────────────────────────
--
-- Copied exactly as it stands on Smartwaiver, down to the empty ("Location")
-- defined term, because the first version's job is continuity — it must be the
-- same document people have been signing all along. Note that it releases
-- Elevated Safety, LLC and is governed by Illinois law; if that naming needs
-- to change, it changes by publishing version 2, and every signature already
-- taken keeps pointing at the words it was actually shown.

insert into public.waiver_templates (slug, name)
values ('elevated-safety-release', 'Elevated Safety Release of Liability')
on conflict (slug) do nothing;

with t as (select id from public.waiver_templates where slug = 'elevated-safety-release'),
     v as (
       insert into public.waiver_template_versions (template_id, version, body, published_at)
       select t.id, 1, $waiver${"title": "Release of Liability and Assumption of Risk Agreement", "warning": "WARNING: THIS IS A LEGALLY BINDING AGREEMENT THAT INCLUDES A RELEASE OF LIABILITY AND ASSUMPTION OF RISKS.", "preamble": "In consideration of my participation in the training program for work at height, industrial rope access, and fall protection and program-related activities conducted by Elevated Safety, LLC, an Illinois limited liability company, at the (“Location”), I agree as follows:", "clauses": [{"number": 1, "paragraphs": ["I agree that the following people, persons, entities, and parties are intentionally and specifically covered by this Release of Liability and Assumption of Risk Agreement and shall now be referred to individually and collectively as the “Released Entities”: Elevated Safety, LLC and Location; including all of their members, officers, directors, employees, agents, and independent contractors."]}, {"number": 2, "heading": "Assumption and Acknowledgement of Risk", "paragraphs": ["I affirm and acknowledge that I am fully informed of the inherent risks and hazards associated with participation in the training program for work at height, industrial rope access, and fall protection and program-related activities conducted by Elevated Safety, LLC, at Location (the “Training Program”). These INHERENT RISKS AND HAZARDS include, but are not limited to, the following:"], "items": [{"label": "a", "text": "Injury or death resulting from failure or malfunction of my equipment, another participant’s equipment, or equipment provided by the Released Entities, including but not limited to the failure or malfunction of ropes, harnesses, platforms, or landing surface."}, {"label": "b", "text": "Injury or death resulting from slips, trips, or falls sustained or from the physical demands associated with participation in the Training Program."}, {"label": "c", "text": "Injury or death resulting from other participants falling on me or other contact with program participants."}, {"label": "d", "text": "Injury or death resulting from improperly tied knots or the use of improper rope techniques."}, {"label": "e", "text": "Injury or death resulting from my negligence or the negligence of other program participants, visitors, persons who may be visiting the Released Entities, or the designers, manufacturers, or installers of the equipment or Training Program facility."}, {"label": "f", "text": "Injury or death resulting from the negligence or lack of adequate training of the Released Entities."}], "trailing": ["I am aware and understand that any injury described above may be severe or permanent and may result in physical impairment or death. I understand that these are only examples of potential hazards and injuries that may arise from my participation in the Training Program. I freely and personally ASSUME ALL RESPONSIBILITY for all risks, whether foreseen or unforeseen, in connection with my participation in the Training Program, and I will be SOLELY RESPONSBLE for any loss or damage I sustain, including personal injuries to me, damage to my property, and damage arising out of my death."]}, {"number": 3, "heading": "Release and Promise Not to Sue", "paragraphs": ["I, on behalf of myself, my family, heirs, successors, assigns, and anyone claiming any interest through me or on my behalf, hereby knowingly, intentionally, and voluntarily PROMISE NOT TO SUE, RELEASE FROM ALL LIABILITY, AND DISCHARGE the Released Entities or any participant, visitor, or person present at the Training Program for any damage, injury, paralysis, loss, or death arising out of or in connection with my participation in the Training Program whether such damage, injury, paralysis, loss, or death results from negligence of the Released Entities or any participant, visitor, or person present at the Training Program or from some other cause. It is my express purpose to bind myself and my family, heirs, successors, assigns, and anyone claiming any interest through me or on my behalf.", "I, on behalf of myself, my family, heirs, successors, assigns, and anyone claiming any interest through me or on my behalf, also knowingly, intentionally, and voluntarily PROMISE NOT TO SUE, RELEASE FROM ALL LIABILITY, AND DISCHARGE the designers, manufacturers, or installers of the equipment or Training Program facility for any damage, injury, paralysis, loss, or death arising out of or in connection with my participation in the Training Program whether such damage, injury, paralysis, loss, or death results from negligence of the designers, manufacturers, or installers of the equipment or Training Program facility or from some other cause. It is my express purpose to bind myself and my family, heirs, successors, assigns, and anyone claiming any interest through me or on my behalf."]}, {"number": 4, "heading": "Indemnification", "paragraphs": ["I understand and explicitly agree on behalf of myself, my family, heirs, successors, assigns, or anyone claiming an interest through me or on my behalf to indemnify and hold harmless the persons RELEASED and DISCHARGED by me from any loss, liability, damages, or cost, including reasonable attorney’s fees, that they may incur due to the presence of any claims or actions brought or threatened by me or by my family, heirs, successors, assigns, or anyone claiming any interest through me or on my behalf arising out of or in connection with my participation in the Training Program."]}, {"number": 5, "heading": "Rules and Instructions", "paragraphs": ["I acknowledge that I have access to and understand the posted rules of the Training Program facility, and I agree to FOLLOW ALL RULES of the facility and to COMPLY WITH THE INSTRUCTIONS of the Training Program instructors."]}, {"number": 6, "paragraphs": ["I understand that this is a contractual agreement and not a mere recital and that I have signed this waiver voluntarily and of my own free will."]}, {"number": 7, "paragraphs": ["I agree that if any provision of this agreement is held by a court of competent jurisdiction to be invalid, unenforceable, or against public policy, only those portions of this agreement held to be invalid, unenforceable, or against public policy shall be stricken, and all other provisions shall remain in full force and effect."]}, {"number": 8, "paragraphs": ["I understand that the descriptive headings of the several sections of this Agreement are inserted for convenience only and do not constitute part of this Agreement."]}, {"number": 9, "paragraphs": ["I agree that this agreement shall be interpreted under the laws of the State of Illinois, without reference to its conflicts of law provisions. I further agree that any dispute regarding this agreement shall be brought in the courts in Cook County, Illinois, and that I waive any argument of forum non conveniens."]}, {"number": 10, "paragraphs": ["I have read and understand this waiver, liability release, and express assumption of the risk and agree to be bound by its terms and conditions. No oral representations or statements or inducements have been made to me that modify anything within the written agreement."]}], "initials_after_clause": 3, "guardian_notice": ["Parent(s) or Court-Appointed Legal Guardian(s) must sign for any participating minor (those under 18 years of age) and agree that they and the minor are subject to all the terms of this document, as set forth above.", "By signing below the Parent or Court-Appointed Legal Guardian agrees that they are also subject to all the terms of this document, as set forth above."], "esign_consent": "By checking here, you are consenting to the use of your electronic signature in lieu of an original signature on paper. You have the right to request that you sign a paper copy instead. By checking here, you are waiving that right. After consent, you may, upon written request to us, obtain a paper copy of an electronic record. No fee will be charged for such copy and no special hardware or software is required to view it. Your agreement to use an electronic signature with us for any documents will continue until such time as you notify us in writing that you no longer wish to use an electronic signature. There is no penalty for withdrawing your consent. You should always make sure that we have a current email address in order to contact you regarding any changes, if necessary."}$waiver$::jsonb, now() from t
       on conflict (template_id, version) do nothing
       returning id, template_id
     )
update public.waiver_templates wt
   set current_version_id = v.id
  from v
 where wt.id = v.template_id;
