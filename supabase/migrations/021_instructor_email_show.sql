-- ─── Add email + show_on_team_page to instructors ────────────────────────────

alter table instructors
  add column email text unique,
  add column show_on_team_page boolean not null default false;

-- ─── Seed emails ──────────────────────────────────────────────────────────────

update instructors set email = 'micah@peak-rescue.com'        where slug = 'micah-rush';
update instructors set email = 'eric@peak-rescue.com'         where slug = 'eric-christensen';
update instructors set email = 'tye@peak-rescue.com'          where slug = 'tye-herron';
update instructors set email = 'toph@peak-rescue.com'         where slug = 'toph-steinhoff';
update instructors set email = 'codycarroll@peak-rescue.com'  where slug = 'cody-carroll';
update instructors set email = 'nadav@peak-rescue.com'        where slug = 'nadav-oakes';
-- dylan-reed: not in email list, left null
update instructors set email = 'h.m.sandell@gmail.com'        where slug = 'hunter-sandell';
update instructors set email = 'cody@peak-rescue.com'         where slug = 'cody-parke';
update instructors set email = 'kooper@peak-rescue.com'       where slug = 'kooper-adams';
update instructors set email = 'brent@peak-rescue.com'        where slug = 'brent-roth';
update instructors set email = 'taylor@peak-rescue.com'       where slug = 'taylor-herron';
update instructors set email = 'ericbrandon@peak-rescue.com'  where slug = 'eric-brandon';
update instructors set email = 'mark@peak-rescue.com'         where slug = 'mark-rickbeil';
update instructors set email = 'dustinfiero@gmail.com'        where slug = 'dustin-fiero';
update instructors set email = 'jakeshultz@peak-rescue.com'   where slug = 'jake-shultz';
update instructors set email = 'connor@peak-rescue.com'       where slug = 'connor-greene';
update instructors set email = 'erica@peak-rescue.com'        where slug = 'erica-pacal';
update instructors set email = 'darcy@peak-rescue.com'        where slug = 'darcy-mcleish';
update instructors set email = 'greg@peak-rescue.com'         where slug = 'greg-cartier';

-- ─── Enable all existing instructors on the team page ────────────────────────

update instructors set show_on_team_page = true;

-- ─── Update handle_new_user trigger to auto-link instructor records ───────────

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- Auto-link to instructor record if their email matches and isn't already linked
  update public.instructors
  set profile_id = new.id
  where email = new.email
    and profile_id is null;

  return new;
end;
$$;
