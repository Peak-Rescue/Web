import { US_STATES, CA_PROVINCES, COUNTRIES } from '@/lib/regions'

// One selector for "where is this?", used by courses and by library maps so
// both sides speak the same codes. States lead because that is where almost
// every course runs; anywhere else is one scroll down the same list.
export default function RegionSelect({
  name,
  defaultValue,
  className,
}: {
  name: string
  defaultValue?: string | null
  className?: string
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ''} className={className}>
      <option value="">— not set —</option>
      <optgroup label="United States">
        {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </optgroup>
      <optgroup label="Canada">
        {CA_PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
      </optgroup>
      <optgroup label="Other countries">
        {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </optgroup>
    </select>
  )
}
