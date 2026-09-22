import { formatPhone, phoneParts } from '@/lib/phone'

// A phone field as typed, with each number in it dialable on its own.
//
// People write these as notes rather than as data — "Office: 757-421-1662",
// "Direct: 307.687.8452 | Cell: 307-689-9997" — and the labels are worth
// keeping, so they stay in the text and only the digits become the link.
// Someone who puts two numbers on one line gets two links rather than a
// wrong one. `format` tidies a bare US number into (555) 123-4567.
export default function PhoneText({
  value,
  className = '',
  format = false,
}: {
  value: string | null | undefined
  className?: string
  format?: boolean
}) {
  return (
    <>
      {phoneParts(value).map((p, i) => {
        const text = format ? formatPhone(p.text) : p.text
        return p.href
          ? <a key={i} href={p.href} className={className}>{text}</a>
          : <span key={i}>{text}</span>
      })}
    </>
  )
}
