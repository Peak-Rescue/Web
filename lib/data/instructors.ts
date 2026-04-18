export type InstructorRole = 'lead' | 'specialized' | 'aerial'

export interface Instructor {
  slug: string
  name: string
  role: InstructorRole
  title: string
  bio: string
  certifications: string[]
  specialties: string[]
  avatar?: string
  avatarPosition?: string
  avatarScale?: string
}

export const instructors: Instructor[] = [
  {
    slug: 'micah-rush',
    name: 'Micah Rush',
    role: 'lead',
    title: 'Lead Instructor / Program Director',
    bio: 'Micah Rush brings over 20 years of experience in mountain and technical rescue to the field. A licensed IFMGA/UIAGM Mountain Guide, Micah is a key member of Natrona County Search and Rescue and the Wyoming Hoist Team, where he performs critical aerial rescue operations in challenging environments. His expertise also extends to swift water rescue and avalanche education, underscoring his commitment to advancing backcountry safety. An accomplished Level 3 SPRAT-certified technician, Micah has run remote rigging and safety for television productions and is known for his precision in high-stakes settings. He has earned top honors in three international rescue competitions, showcasing his skills on a global stage. Additionally, Micah has instructed military special operations units worldwide, sharing his advanced rescue techniques and safety protocols.',
    certifications: ['IFMGA/UIAGM Mountain Guide', 'SPRAT Level 3', 'Swiftwater Rescue Technician', 'Avalanche Educator', 'International Canyon Academy'],
    specialties: ['mountain-rescue', 'canyoneering', 'aerial-assets', 'small-team-rescue', 'fall-protection-rope-access'],
    avatar: '/images/instructors/micah-rush.png',
  },
  {
    slug: 'eric-christensen',
    name: 'Eric Christensen',
    role: 'lead',
    title: 'Lead Instructor — Confined Space & High Angle',
    bio: 'Eric Christensen graduated from Colorado State University with a Bachelor\'s Degree in Chemistry and holds an Associate\'s from Casper College in Biology, along with many technical certifications in industrial and fire based rescue services. He began his career in chemistry before transitioning in 2006 to firefighting, hazmat, confined space, and high angle rescue with Los Alamos County Fire Department in New Mexico, where he obtained a Department of Defense Federal Q Security Clearance and provided ALS ambulance services, confined space and high angle rescue for the city of Los Alamos and the Los Alamos National Laboratory. He later returned to Casper, WY, where he currently serves as a Firefighter/EMT-I for Casper Fire Department — the department\'s lead trainer in high angle and confined space rescue.',
    certifications: ['Firefighter/EMT-I', 'SPRAT Level 3', 'Hazmat Technician', 'Confined Space Rescue Technician', 'High Angle Rescue Technician', 'International Canyon Academy'],
    specialties: ['confined-space-rescue', 'fall-protection-rope-access', 'emergency-response-team', 'mountain-rescue', 'canyoneering'],
    avatar: '/images/instructors/eric-christensen.png',
  },
  {
    slug: 'tye-herron',
    name: 'Tye Herron',
    role: 'lead',
    title: 'Lead Instructor — Fire & Industrial',
    bio: 'Tye is a Casper native and has grown up exploring the Wyoming mountains and wilderness. A 23-year veteran on the Casper Fire-EMS department, he is a Captain EMT-I on Rescue 1 where his experience responding to High Angle, Structure, and Trench incidents brings real-world know-how to Peak Rescue. Shortly after finding his calling as a firefighter, Tye began teaching Technical Rescue to aspiring firefighters at Casper College. His expertise led him to positions of leadership on rescue teams with the fire department, and he eventually teamed up with Micah and Peak Rescue around 2010. Tye holds several certifications in the field of technical and wilderness rescue and loves learning about new techniques and equipment.',
    certifications: ['Captain EMT-I', 'SPRAT Level 2', 'High Angle Rescue Technician', 'Trench Rescue Technician', 'Technical Rescue Instructor'],
    specialties: ['firefighter-survival', 'emergency-response-team', 'confined-space-rescue'],
    avatar: '/images/instructors/tye-herron.png',
  },
  {
    slug: 'toph-steinhoff',
    name: 'Toph Steinhoff',
    role: 'lead',
    title: 'Lead Instructor — Operations & Extrication',
    bio: 'Toph spent most of his childhood in the Wyoming outdoors enjoying hunting, fishing, camping and exploring. While going to college he worked as a wildland firefighter for the BLM and graduated from the University of Wyoming with a bachelor\'s in resource management. Many years later he transitioned into the structure firefighting world and found his passion for technical rescue. He holds many certifications and has obtained invaluable knowledge through training and real-world experience. In addition, he serves on an extrication module specializing in removing injured firefighters and civilians from remote areas of the backcountry.',
    certifications: ['SPRAT Level 3', 'Wildland Firefighter', 'Structure Firefighter', 'Vehicle Extrication', 'Technical Rescue Technician', 'International Canyon Academy'],
    specialties: ['emergency-response-team', 'small-team-rescue', 'urban-mobility', 'mountain-rescue', 'canyoneering'],
    avatar: '/images/instructors/toph-steinhoff.png',
    avatarPosition: 'object-[50%_100%]',
    avatarScale: 'scale-[1.75]',
  },
  {
    slug: 'cody-carroll',
    name: 'Cody Carroll',
    role: 'lead',
    title: 'Lead Instructor — Military & Tactical',
    bio: 'Cody spent over 23 years in the military, most of it as a Force Recon Marine. After retiring, he spent a year on the Loveland Fire Department in Colorado as a Firefighter/EMT-W before transitioning back to work as a military training provider. During his time in the military, he deployed to Iraq, Afghanistan, and PACOM, and held billets from team member to platoon commander with in-depth knowledge of team tactics and military mountaineering. For several years he has worked extensively in jungle terrain, developing mobility and jungle warfare programs for the Tactical Tracking Operations School, where he holds the title of VP and delivers jungle-specific training to special operations teams. He holds a current TS/SCI clearance and is a deployable advisor.',
    certifications: ['Mountain Leader', 'Free-Fall Parachutist', 'Combat Diver', 'Dive Supervisor', 'SOF Level 1 Sniper Instructor'],
    specialties: ['jungle-mobility', 'small-team-rescue', 'mountain-mobility-training', 'cold-weather-arctic-operations'],
    avatar: '/images/instructors/cody-carroll.png',
  },
  {
    slug: 'nadav-oakes',
    name: 'Nadav Oakes',
    role: 'lead',
    title: 'Lead Instructor — Mountain Guiding & Operations',
    bio: 'Nadav brings a wealth of expertise and passion for the vertical world to our team. Born and raised in Israel, he honed his skills guiding climbing, mountaineering, and canyoneering throughout the region before transitioning to the US. His journey includes teaching and training rescue units and military special ops teams, alongside industrial rope access and rigging instruction. Nadav\'s commitment to exploration led him to discover new climbing territories in Jordan, culminating in the authorship of a guidebook for Moab, Jordan. Since arriving in the US, Nadav has shared his knowledge by instructing climbing, mountaineering, skiing, and rope rescue rigging across the mountain west and Alaska. He thrives on problem-solving, applying a first principles mindset — whether designing and patenting a new product innovation, optimizing efficiency on an alpine route, or tailoring a solution for a client\'s needs. With a global climbing portfolio spanning the Middle East, Europe, Africa, Asia, and North America, Nadav currently calls Bozeman, Montana home.',
    certifications: ['IFMGA/UIAGM Mountain Guide', 'SPRAT Level 1', 'Wilderness EMT', 'Avalanche Professional II'],
    specialties: ['mountain-mobility-training', 'mountain-rescue', 'canyoneering', 'class-c-canyon-rescue'],
    avatar: '/images/instructors/nadav-oakes.jpeg',
    avatarPosition: 'object-[50%_15%]',
  },
  {
    slug: 'dylan-reed',
    name: 'Dylan Reed',
    role: 'lead',
    title: 'Lead Instructor — Mountain Guiding',
    bio: 'IFMGA certified guide with over a decade leading clients on technical alpine objectives. Dylan has guided on Denali and throughout the Alaska Range, and is one of the team\'s most accomplished technical skiers.',
    certifications: ['IFMGA/UIAGM Mountain Guide', 'Avalanche Professional II', 'Wilderness First Responder'],
    specialties: ['mountain-mobility-training', 'cold-weather-arctic-operations', 'mountain-rope-rescue'],
    avatar: '/images/instructors/dylan-reed.jpg',
    avatarPosition: 'object-[50%_40%]',
  },

  // Specialized Leads
  {
    slug: 'jon-bertsch',
    name: 'Jon Bertsch',
    role: 'specialized',
    title: 'Instructor — Technical Rescue',
    bio: 'With nearly two decades in the rescue industry, Jon has trained, instructed, competed and responded in nearly every terrain type available. He began his rescue career in 2006 when he entered the fire service and spent most of his time away from work in the Rocky Mountains or the canyons of the southwest. He has served on local and regional response teams as team member, trainer, lead, and manager. Jon\'s instructional focus is rooted in helping align an organization\'s profile with its mission profile while emphasizing personal competencies and melding skillsets from all types of technical rescue. He holds certifications in rope rescue, confined space rescue, trench and collapse rescue, and rope access.',
    certifications: ['SPRAT Level 1', 'Rope Rescue Technician', 'Confined Space Rescue Technician', 'Trench & Collapse Rescue'],
    specialties: ['mountain-rope-rescue', 'urban-mobility', 'fall-protection-rope-access'],
    avatar: '/images/instructors/jon-bertsch.png',
  },
  {
    slug: 'cody-parke',
    name: 'Cody Parke',
    role: 'specialized',
    title: 'Instructor — Rope Systems & Access',
    bio: 'Cody Parke is a passionate and enthusiastic instructor at Peak Rescue. His love for teaching, coupled with his deep-rooted passions for rope rescue and firefighting, keeps him energized and always having fun. Cody\'s hands-on approach and excitement for sharing knowledge make him a dynamic and engaging instructor, inspiring those around him to push their limits and learn with confidence.',
    certifications: ['SPRAT Level 2', 'Rope Rescue Technician', 'Firefighter'],
    specialties: ['fall-protection-rope-access', 'urban-mobility', 'confined-space-rescue', 'firefighter-survival', 'emergency-response-team'],
    avatar: '/images/instructors/cody-parke.png',
  },
  {
    slug: 'kooper-adams',
    name: 'Kooper Adams',
    role: 'specialized',
    title: 'Instructor — Mountain & Swiftwater',
    bio: 'Kooper Adams was born and raised in Casper, Wyoming. He grew up deeply involved in athletics and team sports, which fostered his strong teamwork skills. In college, Kooper found his passion for firefighting, beginning his career in wildland fire service. Soon after, he had the opportunity to serve his community at the Casper Fire Department, where he continues to work alongside some of the most skilled firefighters and rescue technicians in the world. Kooper also teaches confined space rescue, rope rescue, SPRAT, and mountain rescue, sharing his knowledge and experience to help others develop their skills in these challenging disciplines.',
    certifications: ['SPRAT Level 2', 'Confined Space Rescue Technician', 'Rope Rescue Technician', 'Mountain Rescue Technician'],
    specialties: ['swiftwater-rescue', 'mountain-rescue', 'firefighter-survival', 'confined-space-rescue', 'fall-protection-rope-access'],
    avatar: '/images/instructors/kooper-adams.png',
  },
  {
    slug: 'brent-roth',
    name: 'Brent Roth',
    role: 'specialized',
    title: 'Instructor — Swiftwater & Canyoneering',
    bio: 'Brent retired from the Navy as a Chief and Master Training Specialist in 2014 and currently instructs Swiftwater Rescue, Rope Rescue, Whitewater Rafting, and Canyoning. He has worked with Western Washington University, Orion Expeditions, the American Alpine Institute, and the Seattle Mountaineers, and has guided trips and led training for Navy and Army recreational programs. As a volunteer for Mountain Rescue, he continuously trains members in technical ropework and water safety. He serves on the ACA Rafting Committee to develop and maintain the rafting curriculum and continues his education as a member of RopeLab, conducting research and development for canyon rigging techniques with HowNOT2 and Glacier Black.',
    certifications: ['ACA L5 Rafting Instructor Trainer', 'ACA L5 Advanced Swiftwater Rescue Instructor', 'icoPRO Level 3 Canyoning', 'Technical Rope Rescue', 'International Canyon Academy'],
    specialties: ['swiftwater-rescue', 'canyoneering', 'water-mobility', 'maritime-mobility'],
    avatar: '/images/instructors/brent-roth.jpg',
    avatarPosition: 'object-top',
  },

  // Aerial Evacuation Leads
  {
    slug: 'connor-greene',
    name: 'Connor Greene',
    role: 'aerial',
    title: 'Aerial Evacuation Lead',
    bio: 'Connor, originally from Bridgewater, Connecticut, moved to Colorado after high school and quickly immersed himself in the world of skiing and rock climbing. His passion for the mountains led him to Keystone Resort in 2014, where he started his career as a first responder Ski Patroller, developing a deep understanding of backcountry rope rescue and aerial ski lift evacuation. Seeking to broaden his skills, Connor spent two winters at Mt Hotham in Australia, honing his abilities in backcountry rescue on steep, icy slopes and the rugged terrain of the Australian Alps. His international experience complements his work across North America, where he has collaborated with various teams to design and implement rescue systems for aerial tramways and ski lifts. Connor specializes in aerial ski lift evacuation and is passionate about pushing industry standards in worker safety and rescue readiness.',
    certifications: ['Ski Patroller', 'Aerial Tramway Evacuation Technician', 'Backcountry Rope Rescue'],
    specialties: ['aerial-assets', 'aerial-tramway-rescue', 'mountain-rope-rescue'],
    avatar: '/images/instructors/connor-greene.png',
  },
  {
    slug: 'gray-grandy',
    name: 'Gray Grandy',
    role: 'aerial',
    title: 'Aerial Evacuation Lead',
    bio: 'Gray Grandy grew up in rural Vermont. While completing his B.S. in Forest Ecology, he started his career as a ski patroller. His experience in rope rescue began with patrol and expanded into the wilderness setting working with El Dorado County Search and Rescue. During summers, he worked on commercial fishing boats, built zip lines, and taught rope rescue and wilderness medical courses for Sierra Rescue. After over a decade of patrolling and overseeing fall protection and rescue for the Western Region of Vail Resorts, Gray relocated to Utah, where he continues to help ski resorts and other organizations with aerial tramways and work at height.',
    certifications: ['EMT-B', 'SPRAT Level 3', 'Avalanche Professional II', 'Confined Space Rescue'],
    specialties: ['aerial-assets', 'mountain-rope-rescue', 'aerial-tramway-rescue'],
    avatar: '/images/instructors/gray-grandy.png',
  },
  {
    slug: 'erica-pacal',
    name: 'Erica Pacal',
    role: 'aerial',
    title: 'Aerial Evacuation Lead',
    bio: 'Erica Pacal grew up skiing and exploring the mountains of Park City, Utah. While earning her B.S. in Psychology, she spent winters as a Ski Patroller at Park City Mountain and summers in Southern California and the British Virgin Islands teaching SCUBA diving. Her professional journey into rope access and rescue began at the ski resort, where she helped drive advancements in lift evacuation methods. Erica has since led work-at-height and rescue programs at both Park City and Vail Midwest Resorts, with a strong focus on lift evacuation, rope rescue, and rescue operations for lift maintenance and snowmaking teams. She also instructs SPRAT rope access courses, including specialized all-female classes designed to foster inclusivity and break down barriers in the industry.',
    certifications: ['SPRAT Level 3', 'EMT', 'Confined Space Rescue Technician', 'Petzl PPE Competent Person Trainer'],
    specialties: ['aerial-assets', 'fall-protection-rope-access', 'aerial-tramway-rescue'],
    avatar: '/images/instructors/erica-pacal.jpg',
    avatarPosition: 'object-top',
  },
  {
    slug: 'darcy-mcleish',
    name: "D'Arcy McLeish",
    role: 'aerial',
    title: 'Aerial Evacuation Lead',
    bio: "D'Arcy has been working in the rope access, rescue, and ski industry for over 20 years. He has designed evacuation rescue systems for aerial tramways at ski resorts around the world, and has been a ski and bike park patroller at Whistler Blackcomb since 2006. His background spans rope access and confined space rescue across Oil and Gas, Hydro, Dam Inspection, and Structure Work. D'Arcy is a certified helicopter long line (short haul) technician, has trained industry and SAR groups in Wildland Rope Rescue, and served as a rope access instructor for 10 years. He also worked as a bush pilot in Northern Canada. His mixed experience across all rescue disciplines gives him a well-rounded, open-minded approach to solving work-at-height problems for any scenario.",
    certifications: ['SPRAT Level 3', 'IRATA Level 3', 'Helicopter Long Line Technician', 'Bush Pilot'],
    specialties: ['aerial-assets', 'aerial-tramway-rescue', 'mountain-rope-rescue', 'fall-protection-rope-access'],
    avatar: '/images/instructors/darcy-mcleish.jpg',
  },
  {
    slug: 'greg-cartier',
    name: 'Greg Cartier',
    role: 'aerial',
    title: 'Aerial Evacuation Lead',
    bio: "Greg's expertise spans rescue operations, military leadership, and the legal field. Born and raised in Holyoke, MA, he graduated from Norwich University in 2005 and served on the Mountain Cold Weather Rescue Team before joining the Army as an Infantry Officer with the 10th Mountain Division, completing Mountain Warfare, Airborne, and Ranger School training and deploying to Iraq. After leaving the Army, Greg earned a Juris Doctorate from Western New England University School of Law in 2011. In 2015, he joined the Okemo Ski Patrol, where he now serves as Ski Patrol Manager, overseeing daily mountain operations, hazard mitigation, and guest safety while acting as the Fall Protection and Rescue Manager for Vail Resorts' Eastern region. As a SPRAT Level III technician, Greg specializes in aerial tramway and mountain rescue, managing fall protection operations for major ski resorts across the East Coast.",
    certifications: ['SPRAT Level 3', 'Mountain Warfare', 'Airborne', 'Ranger School'],
    specialties: ['aerial-assets', 'aerial-tramway-rescue', 'fall-protection-rope-access'],
    avatar: '/images/instructors/greg-cartier.jpg',
  },
]

export function getInstructorBySlug(slug: string): Instructor | undefined {
  return instructors.find((i) => i.slug === slug)
}

export const roleLabels: Record<InstructorRole, string> = {
  lead: 'Lead Instructor',
  specialized: 'Specialized Instructor',
  aerial: 'Aerial Evacuation Lead',
}
