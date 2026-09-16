import { describe, it, expect } from 'vitest'
import { billTo, billingContact, primaryContactEmail, parseContacts } from '@/lib/contacts'

const poc = { name: 'Dana Reyes', phones: ['307-555-0100'], emails: ['dana@colloid.com'] }
const ap = { name: 'Accounts Payable', phones: [], emails: ['ap@colloid.com'], role: 'billing' as const }

describe('who the bill goes to', () => {
  it('is the course contact when nobody has said otherwise', () => {
    expect(billTo([poc])).toEqual({ contact: poc, tagged: false })
  })

  it('is the tagged one when somebody has', () => {
    expect(billTo([poc, ap])).toEqual({ contact: ap, tagged: true })
  })

  it('says which of the two it is, so a screen can name the fallback', () => {
    expect(billTo([poc])?.tagged).toBe(false)
    expect(billTo([poc, ap])?.tagged).toBe(true)
  })

  it('is somebody with only a name, who is still somebody', () => {
    expect(billTo([{ name: 'Dana', phones: [], emails: [] }])?.contact.name).toBe('Dana')
  })

  it('is nobody when the course has no contacts at all', () => {
    expect(billTo([])).toBeNull()
  })
})

describe('tagging a billing contact', () => {
  it('does not re-route the quote to them', () => {
    // The quote goes to whoever is deciding, which is never accounts payable.
    expect(primaryContactEmail([poc, ap])).toBe('dana@colloid.com')
  })

  it('is still findable on its own, for a screen that means the tag itself', () => {
    expect(billingContact([poc])).toBeNull()
    expect(billingContact([poc, ap])).toBe(ap)
  })

  it('survives the round trip through the form', () => {
    expect(parseContacts(JSON.parse(JSON.stringify([poc, ap])))).toEqual([poc, ap])
  })
})
