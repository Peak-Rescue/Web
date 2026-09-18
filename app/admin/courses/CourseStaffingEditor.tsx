import { createAdminClient } from '@/lib/supabase/admin'
import { loadStaffingPanel, type StaffingPanelData } from '@/lib/staffing-panel'
import type { OffDayRange } from '@/lib/courses'
import StaffingPanel from './StaffingPanel'

// The course page's staffing block: load, then draw.
//
// The drawing is `StaffingPanel` and the loading is `loadStaffingPanel`, both
// shared with the courses list, where the same panel opens in a drawer under
// a row without the course page being rendered at all.
export default async function CourseStaffingEditor(props: {
  instanceId: string
  courseType: string | null
  courseCategory: string | null
  customCategories: string[] | null
  internal: boolean
  startsAt: string | null
  endsAt: string | null
  offDays: OffDayRange[]
}) {
  const data: StaffingPanelData = await loadStaffingPanel(createAdminClient(), props)
  return <StaffingPanel data={data} />
}
