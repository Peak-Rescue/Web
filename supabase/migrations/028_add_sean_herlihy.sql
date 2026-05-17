-- ─── Add Sean Herlihy ─────────────────────────────────────────────────────────

insert into instructors (slug, name, instructor_role, title, bio, certifications, specialties, avatar, show_on_team_page)
values (
  'sean-herlihy',
  'Sean Herlihy',
  'specialized',
  'Instructor — Military Rescue & Medicine',
  'Sean is a recently retired Air Force Pararescueman (PJ) who completed assignments with JSOC, AFSOC, ACC and the Air Force Academy. He''s a Nationally Registered Paramedic (NRP), a Fellow in the Academy of Wilderness Medicine, and holds a Diploma in Mountain Medicine (DiMM). Additionally, he''s an AMGA Assistant Rock Guide, Apprentice Alpine Guide, and an Ice Instructor Course graduate. He also holds his AAA Avalanche Pro 1 certification.

During his 26 years in the military, Sean completed 11 deployments across the globe leading Combat Rescue and Personnel Recovery Task Forces, as well as providing technical rescue, medical, and combat capabilities to special operations teams. He''s a qualified PJ Team Leader, Military Freefall Jumpmaster, Accelerated Freefall Instructor, Diving Supervisor, and graduate of the Joint Special Operations Forces Senior Enlisted Advisor (JSOFSEA) course. Sean is passionate about teaching and integrating climbing, rescue, and medical skills to produce more capable warfighters.',
  ARRAY['Nationally Registered Paramedic (NRP)', 'Fellow, Academy of Wilderness Medicine', 'Diploma in Mountain Medicine (DiMM)', 'AMGA Assistant Rock Guide', 'AMGA Apprentice Alpine Guide', 'Ice Instructor Course Graduate', 'AAA Avalanche Pro 1', 'Military Freefall Jumpmaster', 'Accelerated Freefall Instructor', 'Diving Supervisor'],
  ARRAY['mountain-rescue', 'mountain-mobility-training', 'small-team-rescue', 'emergency-response-team'],
  '/images/instructors/sean-herlihy.jpeg',
  true
);
