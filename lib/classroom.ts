// Reading Google Classroom directly, rather than inferring it from Drive.
//
// The content library was built by walking Drive and reconstructing what
// Classroom had done to the files — topic names survived only as emoji-
// prefixed folder names (see lib/library.ts), and attachments were scattered
// across whichever instructor uploaded them (see migration 092). Classroom
// itself holds the structure those workarounds were approximating: real
// topics, real course/material relationships, real rosters.
//
// Everything here goes through domain-wide delegation. A service account has
// no Classroom presence of its own — it isn't a teacher on anything — so every
// call acts as a Workspace user who is.

import { googleToken, serviceKey } from '@/lib/google-auth'

const API = 'https://classroom.googleapis.com/v1'

// Granted to the service account's client ID in the Workspace admin console.
// Read scopes for the migration; rosters is the one that can also write, and
// is what adding a co-teacher needs.
export const CLASSROOM_SCOPES = {
  courses: 'https://www.googleapis.com/auth/classroom.courses.readonly',
  topics: 'https://www.googleapis.com/auth/classroom.topics.readonly',
  materials: 'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  rosters: 'https://www.googleapis.com/auth/classroom.rosters',
} as const

export function classroomEnabled(): boolean {
  return Boolean(serviceKey())
}

export type Course = {
  id: string
  name: string
  section?: string
  descriptionHeading?: string
  courseState: string
  alternateLink: string
  ownerId?: string
}

export type Topic = { topicId: string; name: string; updateTime?: string }

export type Material = {
  driveFile?: { driveFile?: { id: string; title?: string; alternateLink?: string } }
  link?: { url: string; title?: string }
  youtubeVideo?: { id: string; title?: string; alternateLink?: string }
  form?: { formUrl: string; title?: string }
}

export type CourseMaterial = {
  id: string
  title: string
  description?: string
  topicId?: string
  state: string
  alternateLink: string
  updateTime?: string
  materials?: Material[]
}

async function get<T>(path: string, scope: string, as: string, params?: Record<string, string>): Promise<T> {
  const token = await googleToken(scope, as)
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  const res = await fetch(`${API}/${path}${qs}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Classroom ${path} failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<T>
}

// Every list endpoint pages the same way; none of these collections is large
// enough to want streaming.
async function listAll<T>(
  path: string,
  scope: string,
  as: string,
  key: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const out: T[] = []
  let pageToken: string | undefined
  do {
    const page = await get<Record<string, unknown>>(path, scope, as, {
      ...params,
      pageSize: '100',
      ...(pageToken ? { pageToken } : {}),
    })
    out.push(...((page[key] as T[]) ?? []))
    pageToken = page.nextPageToken as string | undefined
  } while (pageToken)
  return out
}

// courses.list has no "everything in the domain" mode — it filters by a single
// teacher or student. So a full picture means asking as each instructor and
// merging; the same class comes back once per teacher on it.
export async function coursesFor(teacher: string): Promise<Course[]> {
  return listAll<Course>('courses', CLASSROOM_SCOPES.courses, teacher, 'courses', {
    teacherId: 'me',
    courseStates: 'ACTIVE',
  })
}

export async function coursesForAll(teachers: string[]): Promise<Map<string, Course & { seenBy: string[] }>> {
  const byId = new Map<string, Course & { seenBy: string[] }>()
  for (const t of teachers) {
    let courses: Course[]
    try {
      courses = await coursesFor(t)
    } catch {
      // An instructor with no Classroom presence (or a disabled account) isn't
      // an error — it just contributes nothing.
      continue
    }
    for (const c of courses) {
      const hit = byId.get(c.id)
      if (hit) hit.seenBy.push(t)
      else byId.set(c.id, { ...c, seenBy: [t] })
    }
  }
  return byId
}

export async function topics(courseId: string, as: string): Promise<Topic[]> {
  return listAll<Topic>(`courses/${courseId}/topics`, CLASSROOM_SCOPES.topics, as, 'topic')
}

export async function materials(courseId: string, as: string): Promise<CourseMaterial[]> {
  return listAll<CourseMaterial>(
    `courses/${courseId}/courseWorkMaterials`,
    CLASSROOM_SCOPES.materials,
    as,
    'courseWorkMaterial'
  )
}

// Adding a teacher outright (rather than sending an invitation they must
// accept) requires acting as a domain administrator — Google only lets admins
// add users directly to courses in their domain.
export async function addTeacher(courseId: string, email: string, asAdmin: string): Promise<void> {
  const token = await googleToken(CLASSROOM_SCOPES.rosters, asAdmin)
  const res = await fetch(`${API}/courses/${courseId}/teachers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: email }),
  })
  // Already a teacher is the desired end state, not a failure.
  if (res.status === 409) return
  if (!res.ok) throw new Error(`Adding ${email} to ${courseId} failed (${res.status}): ${await res.text()}`)
}
