-- ─── Drop superseded instructor_capabilities ──────────────────────────────────

drop policy if exists "capabilities: instructors read own" on instructor_capabilities;
drop table if exists instructor_capabilities;

-- ─── Create instructors table ─────────────────────────────────────────────────

create table instructors (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  instructor_role text not null check (instructor_role in ('lead', 'specialized', 'aerial')),
  title           text not null,
  bio             text not null default '',
  certifications  text[] not null default '{}',
  specialties     text[] not null default '{}',
  avatar          text,
  avatar_position text,
  avatar_scale    text,
  profile_id      uuid references profiles(id) on delete set null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ─── Seed instructors ─────────────────────────────────────────────────────────

insert into instructors (slug, name, instructor_role, title, bio, certifications, specialties, avatar, avatar_position, avatar_scale) values

('micah-rush', 'Micah Rush', 'lead', 'Lead Instructor / Program Director',
'Micah Rush brings over 20 years of experience in mountain and technical rescue to the field. A licensed IFMGA/UIAGM Mountain Guide, Micah is a key member of Natrona County Search and Rescue and the Wyoming Hoist Team, where he performs critical aerial rescue operations in challenging environments. His expertise also extends to swift water rescue and avalanche education, underscoring his commitment to advancing backcountry safety. An accomplished Level 3 SPRAT-certified technician, Micah has run remote rigging and safety for television productions and is known for his precision in high-stakes settings. He has earned top honors in three international rescue competitions, showcasing his skills on a global stage. Additionally, Micah has instructed military special operations units worldwide, sharing his advanced rescue techniques and safety protocols. His experience, from technical rigging to elite instruction, makes him a respected instructor and a vital asset to any rescue or safety program.',
ARRAY['IFMGA/UIAGM Mountain Guide', 'SPRAT Level 3', 'Swiftwater Rescue Technician', 'Avalanche Educator', 'International Canyon Academy'],
ARRAY['mountain-rescue', 'canyoneering', 'aerial-assets', 'small-team-rescue', 'fall-protection-rope-access'],
'/images/instructors/micah-rush.png', null, null),

('eric-christensen', 'Eric Christensen', 'lead', 'Lead Instructor — Confined Space & High Angle',
'Eric Christensen graduated from Colorado State University with a Bachelors Degree in Chemistry. In addition to his chemistry degree, he also holds an Associates from Casper College in Biology and many technical certifications in industrial and fire based rescue services. Eric started his career in chemistry but made a career change in Jan 2006 when he pursued a career involving firefighting, hazmat, confined space and high angle rescue with the Los Alamos County Fire Department in New Mexico. After obtaining a Department of Defense Federal Q Security Clearance, Eric was able to provide ALS ambulance services, confined space, high angle rescue, and other firefighter services for the city of Los Alamos and the Los Alamos National Laboratory. Eric later relocated back to his home town of Casper, WY and currently serves as a Firefighter/EMT-I for the Casper Fire Department. He is now the department''s lead trainer in high angle and confined space rescue and serves as an instructor here at Peak Rescue.',
ARRAY['Firefighter/EMT-I', 'SPRAT Level 3', 'Hazmat Technician', 'Confined Space Rescue Technician', 'High Angle Rescue Technician', 'International Canyon Academy'],
ARRAY['confined-space-rescue', 'fall-protection-rope-access', 'emergency-response-team', 'mountain-rescue', 'canyoneering'],
'/images/instructors/eric-christensen.png', null, null),

('tye-herron', 'Tye Herron', 'lead', 'Lead Instructor — Fire & Industrial',
'Tye is a Casper native and has grown up exploring the Wyoming mountains and wilderness. He enjoys camping, skiing, hiking, climbing, and mountaineering in his spare time. Tye has two sons and a daughter with whom he loves to teach and share his passion for outdoor sports and nature. Tye is a 23 year veteran on the Casper Fire-EMS department in Casper, WY. He is a Captain EMT-I on Rescue 1 where his experience responding to various rescue emergencies, including High Angle, Structure and Trench incidents, brings "real world" know how to Peak Rescue. Shortly after finding his calling as a Firefighter, Tye began teaching Technical Rescue to aspiring Firefighters at Casper College. His expertise led him to positions of leadership on the rescue teams with the fire department and eventually he teamed up with Micah and Peak Rescue around 2010. Tye holds several certifications in the field of technical and wilderness rescue, and he still loves learning about new techniques and equipment.',
ARRAY['Captain EMT-I', 'SPRAT Level 2', 'High Angle Rescue Technician', 'Trench Rescue Technician', 'Technical Rescue Instructor'],
ARRAY['firefighter-survival', 'emergency-response-team', 'confined-space-rescue'],
'/images/instructors/tye-herron.png', null, null),

('toph-steinhoff', 'Toph Steinhoff', 'lead', 'Lead Instructor — Operations & Extrication',
'Toph spent most of his childhood in the Wyoming outdoors enjoying hunting, fishing, camping and exploring. While going to college he worked as a wildland firefighter for the BLM and graduated from the University of Wyoming with a bachelor''s in resource management. Many years later he transitioned into the structure firefighting world and found his passion for technical rescue. He holds many certifications and has obtained invaluable knowledge through training and real-world experience. In addition, he serves on an extrication module specializing in removing injured firefighters and civilians from remote areas of the backcountry. Toph has been to countless 80s rock concerts and brings an upbeat positive attitude to every situation he encounters. He lives by two credos in life; you can''t have no in your heart and life is a garden...dig it! He enjoys anything outdoors and spending time with his family. He is the newest addition to the Peak Rescue team but has proved to be an invaluable asset in and out of the classroom.',
ARRAY['SPRAT Level 3', 'Wildland Firefighter', 'Structure Firefighter', 'Vehicle Extrication', 'Technical Rescue Technician', 'International Canyon Academy'],
ARRAY['emergency-response-team', 'small-team-rescue', 'urban-mobility', 'mountain-rescue', 'canyoneering'],
'/images/instructors/toph.JPG', 'object-[50%_42%]', 'scale-[2.5]'),

('cody-carroll', 'Cody Carroll', 'lead', 'Lead Instructor — Military & Tactical',
'Cody spent over 23 years in the military, most of it as a Force Recon Marine. After he retired, he spent a year on the Loveland Fire Department in Colorado as a Firefighter/EMT-W, before transitioning back to work as a military training provider. During his time in the military, he deployed to lovely places like Iraq, Afghanistan and PACOM. He has held billets from team member to platoon commander and has in-depth knowledge of team tactics and the application of mountaineering skills to the military mountaineering team. He holds the military qualifications of Mountain Leader, Free-Fall Parachutist, Combat Diver, Dive Supervisor and currently moonlights as a SOF Level 1 Sniper Instructor. He is a current TS/SCI clearance holder and a deployable advisor. For the last several years he has worked extensively in jungle terrain, developing mobility and jungle warfare programs for the Tactical Tracking Operations School, where he currently holds the title of VP and delivers jungle specific training to special operations teams. Cody is passionate about transferring the technical mountaineering and rope related skills to our military clients. He believes that these skills give commanders access to terrain that would be considered "denied" by most and that these skills open the playbook for operational access.',
ARRAY['Mountain Leader', 'Free-Fall Parachutist', 'Combat Diver', 'Dive Supervisor', 'SOF Level 1 Sniper Instructor'],
ARRAY['jungle-mobility', 'small-team-rescue', 'mountain-mobility-training', 'cold-weather-arctic-operations'],
'/images/instructors/cody-carroll.png', null, null),

('nadav-oakes', 'Nadav Oakes', 'lead', 'Lead Instructor — Mountain Guiding & Operations',
'Nadav brings a wealth of expertise and passion for the vertical world to our team. Born and raised in Israel, he honed his skills guiding climbing, mountaineering, and canyoneering throughout the region before transitioning to the US. His journey includes teaching and training rescue units and military special ops teams, alongside industrial rope access and rigging instruction. Nadav''s commitment to exploration led him to discover new climbing territories in Jordan, culminating in the authorship of a guidebook for Moab, Jordan. Since arriving in the US, Nadav has shared his knowledge by instructing climbing, mountaineering, skiing, and rope rescue rigging across the mountain west and Alaska. Notably, he thrives on problem-solving, applying a first principles mindset. Whether designing and patenting a new product innovation, optimizing efficiency on an alpine route, or tailoring a solution for a client''s needs, Nadav consistently applies innovative thinking to his work. With a global climbing portfolio that spans the Middle East, Europe, Africa, Asia, and North America, Nadav currently calls Bozeman, Montana home. He is available for work locally and internationally, offering a breadth of expertise and a dedication to safety and adventure.',
ARRAY['IFMGA/UIAGM Mountain Guide', 'SPRAT Level 1', 'Wilderness EMT', 'Avalanche Professional II'],
ARRAY['mountain-mobility-training', 'mountain-rescue', 'canyoneering', 'class-c-canyon-rescue'],
'/images/instructors/nadav-oakes.jpeg', 'object-[50%_15%]', null),

('dylan-reed', 'Dylan Reed', 'lead', 'Lead Instructor — Mountain Guiding',
'Dylan Reed is an IFMGA certified guide with over a decade of experience in the mountain guiding and technical rescue fields. His accomplishments include the West Buttress of Denali, the Grand Traverse in the Tetons, and executing technical ski descents of iconic peaks like Mount Rainier and the Grand Teton. He possesses robust knowledge in technical rope systems and provides a practical and objective approach of how to apply these systems to solve complex problems in dynamic and high-stakes settings. He trains private clients through remote, high-difficulty terrain and works with Special Forces teams on technical climbing and rescue protocols, thriving in high-pressure environments where both creativity and precision are key. He resides in Allenspark, Colorado.',
ARRAY['IFMGA/UIAGM Mountain Guide', 'Avalanche Professional II', 'Wilderness First Responder'],
ARRAY['mountain-mobility-training', 'cold-weather-arctic-operations', 'mountain-rope-rescue'],
'/images/instructors/dylan-reed.jpg', 'object-[50%_40%]', null),

('hunter-sandell', 'Hunter Sandell', 'specialized', 'Instructor — Technical Rescue',
'Hunter relocated to Casper, WY from Florida where he had five years of professional firefighting experience. Hunter is now a firefighter for the City of Casper. He has acquired certifications in rope rescue, confined space rescue, vehicle extrication, trench rescue, structural collapse rescue, arborist rescue, backcountry rescue, and SPRAT. Hunter has been part of multiple rescue teams including Florida USAR Task Force 6. He is dedicated to continuing to build his own skillset and has a passion for helping others develop their knowledge and rescue skills. When not at work, Hunter enjoys all things outdoors and spending time with his friends and family.',
ARRAY['Rope Rescue Technician', 'Confined Space Rescue Technician', 'Vehicle Extrication', 'Trench Rescue', 'Structural Collapse Rescue', 'Arborist Rescue', 'Backcountry Rescue', 'SPRAT'],
ARRAY['rope-rescue', 'confined-space-rescue', 'emergency-response-team', 'firefighter-survival', 'fall-protection-rope-access'],
'/images/instructors/hunter-sandell.png', 'object-[50%_43%]', null),

('cody-parke', 'Cody Parke', 'specialized', 'Instructor — Rope Systems & Access',
'Cody Parke is a passionate and enthusiastic instructor at Peak Rescue. His love for teaching, coupled with his deep-rooted passions for rope rescue and firefighting, keeps him energized and always having fun. Cody''s hands-on approach and excitement for sharing knowledge make him a dynamic and engaging instructor, inspiring those around him to push their limits and learn with confidence.',
ARRAY['SPRAT Level 2', 'Rope Rescue Technician', 'Firefighter'],
ARRAY['fall-protection-rope-access', 'urban-mobility', 'confined-space-rescue', 'firefighter-survival', 'emergency-response-team'],
'/images/instructors/cody-parke.png', 'object-[50%_90%]', null),

('kooper-adams', 'Kooper Adams', 'specialized', 'Instructor — Mountain & Swiftwater',
'Kooper Adams was born and raised in Casper, Wyoming. He grew up deeply involved in athletics and team sports, which fostered his strong teamwork skills. In college, Kooper found his passion for firefighting, beginning his career in wildland fire service. Soon after, he had the opportunity to serve his community at the Casper Fire Department (CFD), where he continues to work alongside and learn from some of the most skilled firefighters and rescue technicians in the world. Kooper also teaches confined space rescue, rope rescue, SPRAT, and mountain rescue, sharing his knowledge and experience to help others develop their skills in these challenging disciplines. When he''s not at work, Kooper enjoys the outdoors with his wife and son, often hunting, fishing, hiking, and occasionally tackling ultra runs in the mountains they love.',
ARRAY['SPRAT Level 2', 'Confined Space Rescue Technician', 'Rope Rescue Technician', 'Mountain Rescue Technician'],
ARRAY['swiftwater-rescue', 'mountain-rescue', 'firefighter-survival', 'confined-space-rescue', 'fall-protection-rope-access'],
'/images/instructors/kooper-adams.png', null, null),

('brent-roth', 'Brent Roth', 'specialized', 'Instructor — Swiftwater & Canyoneering',
'Brent retired from the Navy as a Chief and Master Training Specialist in 2014 and currently instructs Swiftwater Rescue, Rope Rescue, Whitewater Rafting, and Canyoning. He has worked with Western Washington University, Orion Expeditions, the American Alpine Institute, and the Seattle Mountaineers. He has guided various trips and led training for the Navy and Army recreational programs. As a volunteer for Mountain Rescue, he continuously trains members in technical ropework and water safety. He serves on the ACA Rafting Committee to develop and maintain the rafting curriculum and is an ACA L5 Rafting Instructor Trainer and ACA L5 Advanced Swiftwater Rescue Instructor. His rope training and experience include many rope disciplines giving him a fundamental understanding of technical ropework and insight into how organizations teach it. His initial training is from the Technical Rope Rescue Comprehensive and AMGA Single Pitch Instructor courses from the American Alpine Institute, icoPRO Level 3 Canyoning course, and Rescue 3 SRT-1. He continues his education as a member of RopeLab and conducts research and development for canyon rigging techniques with HowNOT2 and Glacier Black.',
ARRAY['ACA L5 Rafting Instructor Trainer', 'ACA L5 Advanced Swiftwater Rescue Instructor', 'icoPRO Level 3 Canyoning', 'Technical Rope Rescue', 'International Canyon Academy'],
ARRAY['swiftwater-rescue', 'canyoneering', 'water-mobility', 'maritime-mobility'],
'/images/instructors/brent-roth.jpg', 'object-top', null),

('taylor-herron', 'Taylor Herron', 'specialized', 'Instructor — Tower, SPRAT & Backcountry',
'Taylor was born and raised in Casper, WY. He stays busy with his wife and two sons camping, climbing, running and hiking. Taylor brings a unique blend of rope expertise and educational background to his position as a lead instructor for Peak. He was a high school teacher for five years and now works for the Casper Fire Department as a senior firefighter on Truck 3. Taylor''s positive energy and excitement make him fun to learn from when he is teaching industrial, tower, SPRAT, or backcountry classes.',
ARRAY['Firefighter', 'SPRAT', 'Tower Rescue', 'Rope Rescue Technician'],
ARRAY['fall-protection-rope-access', 'rope-rescue', 'mountain-rescue', 'emergency-response-team'],
'/images/instructors/taylor-herron.png', 'object-[50%_55%]', null),

('eric-brandon', 'Eric Brandon', 'specialized', 'Instructor — Technical Rescue & Rope Access',
'Brando was born and raised in Casper, Wyoming, where he spent his childhood racing motocross, snowboarding, hunting, fishing and being outdoors. That passion for the outdoors and adventure led him to begin his career in the fire service with the BLM in 2008, transitioning to Fire EMS-Rescue in 2015, where he serves as a Captain/EMT-I at the Natrona County Fire Protection District. He is the technical rescue program lead for NCFD, a Wyoming Helicopter Hoist Rescue Team crew member, and a Peak Rescue team member since 2023. He is an accomplished ultramarathon runner and triathlete. When not working or teaching, he spends time skiing in the mountains of Montana, Wyoming, and Utah. In the summer, he enjoys camping with his wife and three daughters.',
ARRAY['Captain/EMT-I', 'Rope Rescue Technician', 'Rope Access', 'Confined Space Rescue Technician'],
ARRAY['rope-rescue', 'confined-space-rescue', 'fall-protection-rope-access', 'mountain-rescue'],
'/images/instructors/eric-brandon.JPG', 'object-[50%_0%]', null),

('mark-rickbeil', 'Mark Rickbeil', 'specialized', 'Instructor — Technical Rescue & Aerial Evacuation',
'Mark began his career in rope and rescue in 1995, spending winters as a professional ski patroller at Red Lodge Mountain in Montana and summers guiding in the backcountry and working on high-ropes and challenge course facilitation and construction. He also worked with an arborist for two seasons, gaining experience operating on ropes in tree environments. From 1999 to 2006, Mark served as the Patrol Director at Red Lodge Mountain, during which time he was involved with Red Lodge Fire & EMS and Carbon County Search and Rescue. In 2006, Mark joined the Billings Fire Department and became a member of its technical rescue team in 2007, taking over as team coordinator in 2018 and retiring in October 2024. Mark continues to work part-time as a ski patroller at Red Lodge Mountain, marking over 30 years as a member of the National Ski Patrol – Pro Division. He now travels and teaches technical rescue and REMS (Rapid Extraction Module Support) courses, as well as aerial evacuation and other rescue disciplines for Peak Rescue, and serves as a team lead for REMS assignments on wildland fires.',
ARRAY['SPRAT Level 1', 'National Ski Patrol – Pro Division', 'Technical Rescue Technician', 'REMS Team Lead'],
ARRAY['aerial-tramway-rescue', 'rope-rescue', 'mountain-rescue', 'emergency-response-team'],
'/images/instructors/mark-rickbeil.png', 'object-[50%_30%]', null),

('dustin-fiero', 'Dustin Fiero', 'specialized', 'Instructor — Water Rescue & Technical Rope',
'Dustin Fiero is a San Diego lifeguard with extensive experience in water safety and technical rescue. He has provided water safety for the Big Wave World Tour, working in high-risk environments such as Nazaré, Portugal, Mexico, and Cortez Bank. After operating at the highest levels of ocean safety, Dustin shifted his focus to technical rescue, where he has continued to build his expertise. He has completed California State Fire Training instructor task books in Rope Rescue Technician, Rope Rescue Awareness and Operations, and Water Rescue Technician, along with 15 specialized rope rescue courses with the state and private companies. Dustin is also a cliff rescue instructor and a member of the City of San Diego''s swift water rescue team. Growing up with learning disabilities, he developed a strong commitment to teaching and takes pride in making complex rescue concepts accessible to students of all skill levels.',
ARRAY['Rope Rescue Technician', 'Water Rescue Technician', 'Cliff Rescue Instructor', 'CA State Fire Training Instructor'],
ARRAY['swiftwater-rescue', 'rope-rescue', 'water-mobility', 'mountain-rescue'],
'/images/instructors/dustin-fiero.png', 'object-[0%_top]', null),

('jake-shultz', 'Jake Shultz', 'aerial', 'Aerial Evacuation Lead',
'Jake began his career in rescue at age 16 as an Ocean Lifeguard in Southern California. He then received his EMT certification and transitioned to the San Bernardino Mountains, where he has worked as a Professional Ski Patroller for the past seven years. He currently leads his resort''s Technical Rescue program and oversees all patrol training operations, with a focus on rope rescue, patient care, and team development. Jake also serves as a Team Lead on a REMS (Rapid Extraction Module Support) team, providing medical and technical rope rescue support on wildland fires throughout the western United States. With a background spanning ocean, mountain, and fireline environments, Jake brings a well-rounded, field-tested perspective to rescue operations and instruction.',
ARRAY['EMT', 'Professional Ski Patroller', 'Rope Rescue Technician', 'Ocean Lifeguard', 'REMS Team Lead'],
ARRAY['aerial-tramway-rescue', 'mountain-rescue', 'rope-rescue', 'emergency-response-team'],
'/images/instructors/jake-shultz.png', 'object-[100%_58%]', null),

('connor-greene', 'Connor Greene', 'aerial', 'Aerial Evacuation Lead',
'Connor, originally from Bridgewater, Connecticut, moved to Colorado after high school and quickly immersed himself in the world of skiing and rock climbing. His passion for the mountains led him to Keystone Resort in 2014, where he started his career as a first responder Ski Patroller. During this time, he developed a deep understanding of backcountry rope rescue and aerial ski lift evacuation. Seeking to broaden his skills, Connor spent two winters at Mt Hotham in Australia, where he honed his abilities in backcountry rescue on steep, icy slopes and the rugged terrain of the Australian Alps. His international experience complements his work across North America, where he has collaborated with various teams to design and implement rescue systems for aerial tramways and ski lifts. A dedicated instructor, Connor specializes in aerial ski lift evacuation and is passionate about pushing industry standards in worker safety and rescue readiness. His love for sharing knowledge drives his commitment to helping others master the skills needed for successful rescue operations in challenging environments.',
ARRAY['Ski Patroller', 'Aerial Tramway Evacuation Technician', 'Backcountry Rope Rescue'],
ARRAY['aerial-assets', 'aerial-tramway-rescue', 'mountain-rope-rescue'],
'/images/instructors/connor-greene.png', null, null),

('erica-pacal', 'Erica Pacal', 'aerial', 'Aerial Evacuation Lead',
'Erica Pacal grew up skiing and exploring the mountains of Park City, Utah, developing a lifelong passion for outdoor adventure and rescue work. While earning her B.S. in Psychology, Erica spent her winters as a Ski Patroller at Park City Mountain and her summers in Southern California and the British Virgin Islands, where she taught SCUBA diving. Her professional journey into rope access and rescue began at the ski resort, where she helped drive advancements in lift evacuation methods. Erica has since led work-at-height and rescue programs at both Park City and Vail Midwest Resorts. She has a strong focus on training in lift evacuation, rope rescue, and rescue operations for lift maintenance and snowmaking teams. Erica is a SPRAT Level III, EMT, Confined Space Rescue Technician, and a Petzl PPE Competent Person Trainer. She also instructs SPRAT rope access courses, including specialized all-female classes designed to foster inclusivity and break down barriers in the industry. Passionate about teaching and improving safety standards, Erica is dedicated to making work at height in the ski industry safer for everyone.',
ARRAY['SPRAT Level 3', 'EMT', 'Confined Space Rescue Technician', 'Petzl PPE Competent Person Trainer'],
ARRAY['aerial-assets', 'fall-protection-rope-access', 'aerial-tramway-rescue'],
'/images/instructors/erica-pacal.jpg', 'object-[100%_25%]', null),

('darcy-mcleish', 'D''Arcy McLeish', 'aerial', 'Aerial Evacuation Lead',
'D''Arcy has been working in the rope access, rescue and ski industry for over 20 years. He is a SPRAT and IRATA Level 3, Confined Space and Rope Rescue Rescue Instructor and has designed evacuation rescue systems for aerial tramways at ski resorts around the world. D''Arcy has been a ski and bike park patroller at Whistler Blackcomb since 2006 and has worked in rope access and confined space rescue across several different industries including Oil and Gas, Hydro, Dam Inspection and Structure Work. He is a certified helicopter long line (short haul) technician, has trained industry and SAR groups in Wildland Rope Rescue and been a rope access instructor for 10 years. He also worked as a bush pilot in Northern Canada. His mixed experience in the rope world has contributed to a deep knowledge base of systems that bridge the gap between all disciplines and allow him time to approach technical solutions with a well rounded and open minded approach to solving work at height problems for any scenario. D''Arcy''s passion is learning and helping teams be the best they can be and is always open to sharing knowledge.',
ARRAY['SPRAT Level 3', 'IRATA Level 3', 'Helicopter Long Line Technician', 'Bush Pilot'],
ARRAY['aerial-assets', 'aerial-tramway-rescue', 'mountain-rope-rescue', 'fall-protection-rope-access'],
'/images/instructors/darcy-mcleish.jpg', null, null),

('greg-cartier', 'Greg Cartier', 'aerial', 'Aerial Evacuation Lead',
'Greg''s expertise spans across rescue operations, military leadership, and the legal field, underpinned by a deep commitment to service and safety. Born and raised in Holyoke, MA, he graduated from Norwich University in 2005 with a Bachelor''s degree and served as a member of the Mountain Cold Weather Rescue Team—a role that cemented his skills in wilderness and technical rescue. Following college, Greg joined the Army as an Infantry Officer with the 10th Mountain Division, where he completed Mountain Warfare, Airborne, and Ranger School training before deploying to Iraq. These experiences forged a unique foundation in leadership and resilience that continues to guide his approach to all professional pursuits. After leaving the Army, Greg earned a Juris Doctorate from Western New England University School of Law in 2011. While his clerkship in Boston provided valuable insights into legal practice, he felt a stronger pull toward hands-on work in outdoor environments. In 2015, he joined the Okemo Ski Patrol, where he now serves as the Ski Patrol Manager. In this role, Greg oversees daily mountain operations, hazard mitigation, and guest safety, while also acting as the Fall Protection and Rescue Manager for Vail Resorts'' Eastern region. As a SPRAT Level III technician, Greg specializes in aerial tramway and mountain rescue, managing fall protection operations for major ski resorts across the East Coast. His military and leadership background equips him with the skills to connect with and train individuals from diverse backgrounds. Dedicated to enhancing safety standards and rescue readiness, Greg combines technical expertise with a passion for helping others navigate the challenges of work-at-height environments.',
ARRAY['SPRAT Level 3', 'Mountain Warfare', 'Airborne', 'Ranger School'],
ARRAY['aerial-assets', 'aerial-tramway-rescue', 'fall-protection-rope-access'],
'/images/instructors/greg-cartier.jpg', null, null);

-- ─── Link Nadav's profile ─────────────────────────────────────────────────────

update instructors
set profile_id = (select id from profiles where email = 'nadav@peakinnovations.ngo')
where slug = 'nadav-oakes';

-- ─── Repoint instance_instructors FK to instructors ───────────────────────────

-- Clear existing assignments — FK target changes from profiles to instructors
truncate instance_instructors;

alter table instance_instructors
  drop constraint instance_instructors_instructor_id_fkey,
  add constraint instance_instructors_instructor_id_fkey
    foreign key (instructor_id) references instructors(id) on delete cascade;

-- ─── Update RLS policies that used instructor_id = auth.uid() ────────────────
-- All policies that joined instance_instructors now need to go through
-- instructors.profile_id instead of matching instructor_id directly to auth.uid()

-- instance_instructors
drop policy if exists "instance_instructors: instructors read own" on instance_instructors;
create policy "instance_instructors: instructors read own"
  on instance_instructors for select
  using (
    exists (
      select 1 from instructors
      where id = instance_instructors.instructor_id
        and profile_id = auth.uid()
    )
  );

-- course_instances
drop policy if exists "instances: assigned instructors read" on course_instances;
create policy "instances: assigned instructors read"
  on course_instances for select
  using (
    exists (
      select 1 from instance_instructors ii
      join instructors instr on instr.id = ii.instructor_id
      where ii.instance_id = course_instances.id
        and instr.profile_id = auth.uid()
    )
  );

-- enrollments
drop policy if exists "enrollments: assigned instructors read" on enrollments;
create policy "enrollments: assigned instructors read"
  on enrollments for select
  using (
    exists (
      select 1 from instance_instructors ii
      join instructors instr on instr.id = ii.instructor_id
      where ii.instance_id = enrollments.instance_id
        and instr.profile_id = auth.uid()
    )
  );

-- course_modules
drop policy if exists "modules: assigned instructors read all" on course_modules;
create policy "modules: assigned instructors read all"
  on course_modules for select
  using (
    exists (
      select 1 from instance_instructors ii
      join instructors instr on instr.id = ii.instructor_id
      where ii.instance_id = course_modules.instance_id
        and instr.profile_id = auth.uid()
    )
  );

-- course_items
drop policy if exists "items: instructors read via module" on course_items;
create policy "items: instructors read via module"
  on course_items for select
  using (
    exists (
      select 1
      from course_modules m
      join instance_instructors ii on ii.instance_id = m.instance_id
      join instructors instr on instr.id = ii.instructor_id
      where m.id = course_items.module_id
        and instr.profile_id = auth.uid()
    )
  );

-- ─── RLS for instructors table ────────────────────────────────────────────────

alter table instructors enable row level security;

create policy "instructors: public read"
  on instructors for select using (true);

create policy "instructors: admin write"
  on instructors for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "instructors: admin update"
  on instructors for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "instructors: admin delete"
  on instructors for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
