import { KIND_GROUPS, KIND_META } from '@/lib/library'

// The type list, grouped by the card each type reads on.
//
// The hierarchy is right — sorting asks which shelf, then which type, and the
// groups answer the first question by shape. What was wrong was the volume:
// a browser draws an optgroup label small, grey and italic, so the half of
// the decision that matters most was the half you had to squint at.
//
// Two things fix it, and both are needed because neither is reliable alone.
// The label is upper-cased here, which no browser can undo, and globals.css
// gives optgroup a weight and a colour, which most browsers honour and
// Safari ignores. Worst case it is still a heading in capitals.
export default function KindOptions() {
  return (
    <>
      {KIND_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label.toUpperCase()}>
          {g.kinds.map((k) => (
            <option key={k} value={k}>{KIND_META[k]}</option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
