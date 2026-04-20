export type ServiceCategory = 'tactical' | 'sar' | 'industrial' | 'specialty'

export interface Service {
  slug: string
  title: string
  shortTitle: string
  category: ServiceCategory
  tagline: string
  description: string
  details: string[]
  heroImage?: string
}

export const categoryMeta: Record<ServiceCategory, { label: string; description: string; image: string }> = {
  tactical: {
    label: 'Military & Tactical',
    description: 'Mobility, rescue, and survival programs for military units and tactical teams.',
    image: '/images/categories/category-tactical.jpg',
  },
  sar: {
    label: 'Backcountry & SAR',
    description: 'Technical rescue and mountain operations for search and rescue teams.',
    image: '/images/categories/category-sar.jpg',
  },
  industrial: {
    label: 'Industrial & Facilities',
    description: 'Rescue, access, and emergency response for industrial facilities, ski patrol, and infrastructure teams.',
    image: '/images/categories/category-industrial.jpg',
  },
  specialty: {
    label: 'Specialty & Commercial',
    description: 'Standby rescue, on-set safety, and specialized support for commercial operations.',
    image: '/images/categories/category-specialty.jpg',
  },
}

export const services: Service[] = [

  // Military & Tactical
  {
    slug: 'aerial-assets',
    title: 'Aerial Assets',
    shortTitle: 'Aerial Assets',
    category: 'tactical',
    heroImage: '/images/services/aerial-assets.jpg',
    tagline: 'Integrate aerial support into complex terrain and rescue operations.',
    description:
      'Trains teams to integrate aerial assets into complex terrain and rescue operations. Participants develop proficiency in fast roping, rappel insertions, hoist operations, external load rigging, and aerial extraction scenarios across mountain, jungle, and maritime environments.',
    details: [
      'Fast rope insertions and rappel extractions from rotary wing',
      'Hoist operations — short haul, litter, and personnel recovery',
      'External load rigging and sling load fundamentals',
      'Landing zone selection, marking, and management',
      'Aerial casualty evacuation and patient transfer procedures',
      'Scenario-based training integrating aerial assets into ground operations',
    ],
  },
  {
    slug: 'stableflight',
    title: 'StableFlight™ Bag and Seat Training',
    shortTitle: 'StableFlight™',
    category: 'sar',
    heroImage: '/images/services/stableflight.png',
    tagline: 'Helicopter bag and seat operations for tactical and rescue teams.',
    description:
      'Purpose-built training for teams using the StableFlight™ hoist bag and rescue seat systems. Covers rigging, patient loading, in-flight stability, and crew coordination for helicopter-delivered rescue.',
    details: [
      'StableFlight™ bag configuration and pre-flight checks',
      'Patient packaging and loading for hoist operations',
      'In-flight stability management and crew communication',
      'Rescue seat operations — single and tandem configurations',
      'Coordination with flight crew for confined and elevated extractions',
      'Applicable to SAR, tactical, and offshore rescue operations',
    ],
  },
  {
    slug: 'small-team-rescue',
    title: 'Small Team Rescue',
    shortTitle: 'Small Team Rescue',
    category: 'tactical',
    heroImage: '/images/services/small-team-rescue.jpg',
    tagline: 'Efficient teammate extraction and injury stabilization while maintaining operational readiness.',
    description:
      'Focuses on efficient, small team rescue techniques for units that must extract teammates from difficult terrain and stabilize injuries without dedicated rescue infrastructure. Training adapts to mountain, urban, jungle, maritime, and arctic environments.',
    details: [
      'Teammate extraction from technical and complex terrain',
      'Injury stabilization while maintaining operational readiness',
      'Improvised rescue systems using available materials and equipment',
      'Field-expedient stretcher construction and litter packaging',
      'Scenario-based training across mountain, urban, jungle, and arctic environments',
    ],
  },
  {
    slug: 'jungle-mobility',
    title: 'Jungle Mobility Training',
    shortTitle: 'Jungle Mobility',
    category: 'tactical',
    heroImage: '/images/services/jungle-mobility.jpg',
    tagline: 'Equip your team with the tactical skills required to operate in dense tropical environments.',
    description:
      'Equips specialized military teams with the tactical skills required to operate in dense, tropical environments. Students master rope techniques for river crossings, canopy access, and cliff rescues while emphasizing stealth and efficiency. Includes scenario-based training with realistic mission parameters.',
    details: [
      'Jungle movement and navigation with emphasis on stealth and efficiency',
      'Rope systems using natural and improvised anchors in vegetation',
      'River crossing techniques in high-flow jungle conditions',
      'Canopy access and vertical movement through dense vegetation',
      'Cliff descents and escarpment navigation',
      'Scenario-based training with realistic mission parameters',
    ],
  },
  {
    slug: 'urban-mobility',
    title: 'Urban Mobility & Access',
    shortTitle: 'Urban Mobility',
    category: 'tactical',
    heroImage: '/images/services/urban-mobility.jpg',
    tagline: 'Scaling, rappelling, and navigating complex architecture and tight spaces.',
    description:
      'Teaches scaling, rappelling, anchor placement, and navigation through tight spaces and challenging architecture in built environments. Designed for military and law enforcement teams requiring access to elevated or otherwise inaccessible positions in urban terrain.',
    details: [
      'Building rappel and exterior descent techniques',
      'Anchor construction on urban structures — edge, window, and structural anchors',
      'Navigation through tight spaces, stairwells, shafts, and mechanical spaces',
      'Ladder work and rope systems integration',
      'Casualty extraction from elevated and confined urban positions',
      'Scenario-based training in realistic urban environments',
    ],
  },
  {
    slug: 'cold-weather-arctic-operations',
    title: 'Cold Weather & Arctic Operations',
    shortTitle: 'Cold Weather Ops',
    category: 'tactical',
    heroImage: '/images/services/cold-weather-arctic-operations.jpg',
    tagline: 'Movement and sustained operations in snow, ice, and extreme cold environments.',
    description:
      'Covers movement and operations in snow and ice conditions for teams deploying in arctic and sub-arctic environments. Training includes travel techniques, appropriate gear selection, avalanche awareness, snow shelter construction, and navigation for extreme cold — with options to incorporate tactical scenarios.',
    details: [
      'Snow and ice travel techniques — crampons, ice axe, and rope management',
      'Gear selection and layering for sustained cold-weather operations',
      'Avalanche awareness, terrain selection, and companion rescue',
      'Snow shelter construction — quinzee, snow trench, and tarp systems',
      'Navigation in whiteout and reduced-visibility conditions',
      'Cold injury recognition, prevention, and field treatment',
    ],
  },
  {
    slug: 'water-mobility',
    title: 'Water Mobility',
    shortTitle: 'Water Mobility',
    category: 'tactical',
    heroImage: '/images/services/water-mobility.jpg',
    tagline: 'Expertise in aquatic and amphibious operations for military teams.',
    description:
      'Tailored for military teams needing expertise in aquatic and amphibious operations. Emphasizes swift-water rescue, tactical river crossings, and underwater movement with minimal gear reliance — building water competency that supports operations across any environment where water is a terrain feature.',
    details: [
      'Tactical river crossing — solo, buddy, and team techniques',
      'Swift-water movement and survival in current',
      'Underwater movement with minimal gear reliance',
      'Load management and equipment protection during water crossings',
      'Water entry and exit techniques in full kit',
      'Cold-water immersion survival and rewarming procedures',
    ],
  },
  {
    slug: 'maritime-mobility',
    title: 'Maritime Mobility',
    shortTitle: 'Maritime Mobility',
    category: 'tactical',
    heroImage: '/images/services/maritime-mobility.jpg',
    tagline: 'Skills for coastal, inland waterway, and maritime vessel operations.',
    description:
      'Provides skills for coastal, inland waterway, and maritime vessel operations, including boarding and egress techniques from large structures. Designed for teams operating in or transitioning through maritime environments as part of broader mission profiles.',
    details: [
      'Open-water swimming under load and in gear',
      'Vessel boarding techniques — ladder, free-climb, and assisted',
      'Boarding and egress from large maritime structures and platforms',
      'Inland waterway crossing and movement techniques',
      'Night operations and limited-visibility water movement',
      'Small boat operations and casualty recovery at sea',
    ],
  },

  // Backcountry & SAR
  {
    slug: 'mountain-rescue',
    title: 'Mountain Rescue',
    shortTitle: 'Mountain Rescue',
    category: 'sar',
    heroImage: '/images/services/mountain-rescue-thumb.jpeg',
    tagline: 'Rope rescue and self-rescue techniques in a high mountain environment.',
    description:
      'Integrates rope rescue and self-rescue techniques in a high mountain environment. Students apply rope rescue techniques with mountain-specific modifications and develop strategies for complex backcountry rescue problems — from moving patients efficiently in remote terrain to setting up for helicopter operations. Available at Operations and Technician levels.',
    details: [
      'Site control — managing scenes to prevent accidents and identify hazards',
      'Incident identification — operations vs. technician-level response decisions',
      'Patient movement in backcountry settings and helicopter operations preparation',
      'Rope Rescue Operations: foundational skills and hands-on rescue scenarios',
      'Rope Rescue Technician: high-angle rescues, physics-based system construction, high-line systems',
      'Customizable for SAR units, mountain guides, and professional rescue teams',
    ],
  },
  {
    slug: 'mountain-mobility-training',
    title: 'Mountain Mobility Training',
    shortTitle: 'Mountain Mobility',
    category: 'tactical',
    heroImage: '/images/services/mountain-mobility-training.jpg',
    tagline: 'Prepare your team for alpine and mountainous terrain operations — summer and winter.',
    description:
      'Prepares teams for alpine and mountainous terrain operations through summer and winter modules. Summer focuses on lightweight rope systems for steep terrain; winter covers snow and ice navigation and avalanche awareness. Both modules can incorporate live fire and tactical scenarios.',
    details: [
      'Efficiency on 3rd–5th class terrain',
      'Lightweight alpine rope techniques and tactical follow techniques',
      'Crampon and ice axe technique on snow and ice',
      'Avalanche awareness, terrain selection, and companion rescue',
      'Weather pattern recognition and go/no-go decision frameworks',
      'Live fire and tactical scenario integration available for both modules',
    ],
  },
  {
    slug: 'class-c-canyon-rescue',
    title: 'Class C Canyon Rescue',
    shortTitle: 'Class C Canyon Rescue',
    category: 'sar',
    heroImage: '/images/services/Canyon.jpeg',
    tagline: 'Technical rescue in swiftwater canyon environments — moving water meets vertical terrain.',
    description:
      'A five-day collaborative program training rescue team members in the fundamental skills required for swiftwater canyoning rescue operations. Combines technical canyon rope systems with moving-water rescue techniques for teams operating in technical drainages.',
    details: [
      'Reading canyon hydrology — identifying hydraulics in confined terrain',
      'Rope systems adapted for canyon anchor placements in wet conditions',
      'Swiftwater self-rescue and team rescue in technical canyons',
      'Pothole and siphon entrapment prevention and extraction',
      'Patient packaging and evacuation from water-filled canyon environments',
      'Decision-making in dynamic canyon conditions — water level, weather, escape routes',
    ],
  },
  {
    slug: 'swiftwater-rescue',
    title: 'Swiftwater Rescue',
    shortTitle: 'Swiftwater Rescue',
    category: 'sar',
    heroImage: '/images/services/swiftwater-rescue.jpg',
    tagline: 'Dynamic, scenario-based water rescue training with hands-on progressive techniques proven in the field.',
    description:
      'Dynamic and scenario-based swiftwater rescue training using hands-on progressive techniques proven to work in the field. Addresses flood rescue — one of the world\'s leading causes of life and property loss — and can be customized for professional rescue teams or tailored to specific operational needs.',
    details: [
      'River hydraulics — reading water, identifying hazards',
      'Defensive and aggressive swimming techniques',
      'Throw bag operations, shore-based rescue, and wade assists',
      'Strainer entrapment and foot entrapment scenarios',
      'Rope-based swiftwater systems — tensioned diagonal, vector pull',
      'Flood rescue planning and multi-agency incident management',
    ],
  },
  {
    slug: 'canyoneering',
    title: 'Canyon Mobility',
    shortTitle: 'Canyon Mobility',
    category: 'tactical',
    heroImage: '/images/services/canyoneering.jpg',
    tagline: 'Navigate narrow canyons and rugged slot terrain with a focus on military applications.',
    description:
      'This course hones the skills required to navigate narrow canyons and rugged slot terrain with a focus on military applications. Students will learn advanced rigging techniques, water hazards navigation, confined space maneuvers, and rapid team movement through technical canyon systems. Training scenarios replicate the complexities of tactical engagements in confined natural environments, prioritizing safety, speed, and mission success.',
    details: [
      'Advanced rigging for releasable, redirectable, and retrievable rappel systems',
      'Canyon-specific anchors — natural, bolted, and improvised',
      'Water-hazard navigation — pools, siphons, and keeper obstacles',
      'Pothole entrapment prevention and self-rescue',
      'Flash flood awareness and escape route planning',
      'Casualty evacuation from deep canyon environments',
    ],
  },

  // Industrial & Facilities
  {
    slug: 'rope-rescue',
    title: 'Rope Rescue',
    shortTitle: 'Rope Rescue',
    category: 'industrial',
    heroImage: '/images/services/rope-rescue-thumb.jpg',
    tagline: 'Become a Rope Rescue Technician — NFPA 1006 compliant training at Operations and Technician levels.',
    description:
      'NFPA 1006 compliant rope rescue training for industrial teams, facilities, and emergency responders. Students train in both classroom and real-world scenario environments with access to state-of-the-art simulated sites and current equipment. Available at Operations level for foundational skills and Technician level for advanced, multi-system rescues.',
    details: [
      'Site control — managing scenes to prevent accidents and identify hazards',
      'Incident identification — operations vs. technician-level response decisions',
      'Patient rescue on low and high-angle terrain, litter operations, and high-line systems',
      'Rope Rescue Operations: foundational skills and hands-on scenarios aligned with NFPA standards',
      'Rope Rescue Technician: high-angle rescues, physics-based system construction, high-line systems',
      'Applicable to industrial rope access, confined space, tower, fire, and USAR contexts',
    ],
  },
  {
    slug: 'confined-space-rescue',
    title: 'Confined Space Rescue',
    shortTitle: 'Confined Space',
    category: 'industrial',
    heroImage: '/images/services/confined-space-rescue.jpg',
    tagline: 'OSHA-compliant confined space entry and rescue — because over 60% of confined space fatalities happen during rescue.',
    description:
      'Specialized confined space rescue training addressing one of the most hazardous industrial scenarios: over 60% of all fatalities involving confined spaces occur during the rescue attempt. Available as a 3-day OSHA-compliant course or a 6-day NFPA combination program awarding two certifications.',
    details: [
      'Safe entry, work, and exit procedures with and without breathing apparatus',
      'Atmospheric monitoring — oxygen deficiency, flammability, toxicity',
      'Supplied air breathing systems and communications',
      'Tripods, artificial anchor points, and rope systems for confined space',
      'Patient packaging, vertical and horizontal recovery',
      'Lock-out/tag-out procedures and rescuer safety protocols',
    ],
  },
  {
    slug: 'fall-protection-rope-access',
    title: 'Fall Protection & Rope Access',
    shortTitle: 'Rope Access',
    category: 'industrial',
    heroImage: '/images/services/fall-protection-rope-access.jpg',
    tagline: 'Fall protection systems and SPRAT-aligned rope access training for industrial work-at-height.',
    description:
      'Covers fall protection and rope access for workers at height. Fall Protection training (2-day) develops proficiency in protection systems, equipment usage, freefall distance calculations, and fall protection planning. Rope Access training offers three SPRAT-certified levels for workers needing rope-based access to elevated worksites.',
    details: [
      'Fall hazard identification, protection hierarchy, and guardrail applications',
      'Personal fall arrest systems — harness, lanyard, and anchor selection',
      'Travel restraint, fall restraint, and work positioning systems',
      'Rope access ascent, descent, changeovers, and obstruction navigation (SPRAT-aligned)',
      'Rescue from suspension and elevated position patient lowering',
      'Fall Protection for Supervisors: program components, rescue planning, incident investigation',
    ],
  },
  {
    slug: 'emergency-response-team',
    title: 'Emergency Response Team Training',
    shortTitle: 'ERT Training',
    category: 'industrial',
    heroImage: '/images/services/emergency-response-team.png',
    tagline: 'Build and train a high-performance emergency response team.',
    description:
      'Comprehensive ERT program for industrial facilities and corporate campuses. Builds team capability from initial medical response through technical rescue, with an emphasis on managing the first critical minutes before outside resources arrive.',
    details: [
      'Incident command system integration for facility ERT',
      'Initial patient assessment and stabilization protocols',
      'Extrication techniques for machinery and vehicle entrapment',
      'Medical response — CPR, AED, bleeding control, and airway management',
      'Team coordination drills and tabletop exercises',
      'Full-scale scenario training using facility-specific hazards',
    ],
  },
  {
    slug: 'firefighter-survival',
    title: 'Firefighter Survival Training',
    shortTitle: 'FF Survival',
    category: 'industrial',
    heroImage: '/images/services/firefighter-survival.png',
    tagline: 'Survive today\'s dynamic fire scene — recognize dangerous conditions and execute emergency escapes.',
    description:
      'Teaches firefighters how to survive today\'s dynamic fire scene. Covers recognition of deteriorating conditions, emergency escape procedures for upper-floor entrapments, and personal escape systems — combining case study analysis with extensive hands-on practical training for split-second decision-making.',
    details: [
      'Recognition of deteriorating fire ground conditions',
      'Emergency escape: hang and drop, ladder slide, body wrap techniques',
      'Personal escape system selection and application',
      'Situational awareness, mayday transmissions, and dis-entanglement',
      'Window egress, SCBA confidence, and multiple firefighter egress',
      'Advanced program: roof operations, firefighter rescue, and aerial ladder access',
    ],
  },
  {
    slug: 'aerial-tramway-rescue',
    title: 'Aerial Tramway Rescue & Ski Lift Evacuation',
    shortTitle: 'Aerial Tramway Rescue',
    category: 'industrial',
    heroImage: '/images/services/aerial-tramway-rescue.jpg',
    tagline: 'Passenger evacuation systems for gondolas, chairlifts, cable cars, and aerial trams.',
    description:
      'Peak Rescue provides aerial rescue systems and training for evacuating passengers from gondolas, chairlifts, cable cars, and aerial trams worldwide. Programs comply with industry safety standards and integrate worker rescue components with pre-rigged equipment. Suitable for new installations and established operations.',
    details: [
      'Technician Level training — 5-day certification program',
      'Instructor Level training — 5-day program for in-house trainers',
      'Custom course delivery worldwide for existing operations',
      'Evacuation plan development and emergency procedure writing',
      'Pre-rigged equipment systems with integrated worker rescue',
      'Design-phase consultation for new aerial systems and infrastructure',
    ],
  },
  {
    slug: 'zipline-adventure-park-rescue',
    title: 'Zip-Line & Adventure Park Rescue',
    shortTitle: 'Adventure Park Rescue',
    category: 'industrial',
    heroImage: '/images/services/zipline.jpeg',
    tagline: 'Safely and efficiently evacuate passengers from zip-lines and adventure parks.',
    description:
      'Aerial rescue training for zip-line operators and adventure park staff, developed in collaboration with commercial operations worldwide. Covers multiple rescue and evacuation methods including lowering, rescuer approach, and pulley-to-pulley transfers. Dynamic and hands-on — delivered at our facilities or on-site internationally.',
    details: [
      'Workers-from-height rescue and rescue of workers in suspension',
      'Trolley swap rescue and mid-line lower down/rescue',
      'Platform lower down and evacuation procedures',
      'Stop the Bleed / TCCC and advanced rescue techniques',
      'Equipment inspection, recommendations, and rescue preplans',
      'Site-specific evacuation procedure development',
    ],
  },

  // Specialty & Commercial
  {
    slug: 'standby-rescue',
    title: 'Standby Rescue',
    shortTitle: 'Standby Rescue',
    category: 'specialty',
    heroImage: '/images/services/standby-rescue-2.jpg',
    tagline: 'Trained and equipped rescue professionals on-site when your team needs dedicated backup.',
    description:
      'Standby rescue teams composed of trained, equipped former and current rescue professionals. Specializing in oil and gas sector operations, remote locations, and high-hazard environments where onsite staff lack the resources to respond to rope rescue, confined space, or medical emergencies.',
    details: [
      'Rope rescue and fall rescue standby for work-at-height operations',
      'Confined space standby — the most hazardous rescue scenario in industry',
      'Team certifications: Rescue Technician, Confined Space, Rope Access, First Aid',
      'Gas detection, standby person duties, and entry supervisor coverage',
      'Oil and gas sector specialization — remote locations and rotating staff',
      'Safe, timely, and effective rescue response integrated with your operation',
    ],
  },
  {
    slug: 'tv-rigging-safety',
    title: 'TV Rigging & Safety with Medical Support',
    shortTitle: 'TV Rigging & Safety',
    category: 'specialty',
    heroImage: '/images/services/tv-rigging-safety-2.jpg',
    tagline: 'TV rigging and mountain safety services with certified medical personnel on standby.',
    description:
      'TV rigging and mountain safety services for productions working in technical terrain. State-of-the-art equipment, experienced professionals, and certified medics on standby to provide prompt medical support. Available for single projects or long-term production partnerships.',
    details: [
      'On-set rigging, safety oversight, and professional-grade equipment',
      'Certified medical personnel on standby throughout production',
      'Mountain safety support in technical and remote shooting locations',
      'Rope access for camera positioning and equipment installation',
      'Location risk assessment and emergency action planning',
      'Single-project and long-term production partnership options',
    ],
  },
]

export function getServiceBySlug(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug)
}

export function getServicesByCategory(category: ServiceCategory): Service[] {
  return services.filter((s) => s.category === category)
}
