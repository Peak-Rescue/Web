-- Nadav's actual login email is nadav@peak-rescue.com
update instructors set email = 'nadav@peak-rescue.com' where slug = 'nadav-oakes';

-- Link all instructor records using profiles.email (which IS populated)
update public.instructors i
set profile_id = p.id
from public.profiles p
where p.email = i.email
  and i.profile_id is null;
