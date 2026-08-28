// The shapes a running order is made of, in their own file so that the editor
// and a single day's card can both use them without importing each other.

export type ScheduleTemplateOption = { id: string; name: string; days: number }

export type ScheduleBlock = {
  id: string
  parent_id: string | null
  title: string
  time_label: string | null
  location: string | null
  sort_order: number
}

/** A meetup a day can be pointed at — shared, and often not a site at all. */
export type MeetingPointOption = { id: string; name: string; venue_id?: string | null }

export type SiteOption = {
  id: string
  name: string
  kind: string | null
  beta: string | null
  // The meetup this place usually uses, so picking the canyon fills the
  // morning in rather than leaving it to be retyped.
  meeting_point_id?: string | null
  usual_meeting_time?: string | null
  venue_id?: string | null
  venue_name?: string | null
}

export type ScheduleDay = {
  id: string
  title: string
  location: string | null
  site_id: string | null
  notes: string | null
  objectives: string[]
  meeting_point: string | null
  meeting_point_id: string | null
  meeting_time: string | null
  sort_order: number
  schedule_blocks: ScheduleBlock[]
}

export type Schedule = {
  id: string
  name: string
  overview: string | null
  objectives: string[]
  instance_id: string | null
  is_template: boolean
  schedule_days: ScheduleDay[]
}
