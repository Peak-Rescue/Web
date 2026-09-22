import { describe, it, expect } from 'vitest'
import { linkLabel } from '@/lib/course-links'
import { normalizePhone, formatPhone, phoneParts } from '@/lib/phone'

describe('linkLabel', () => {
  it('prefers what someone called it', () => {
    expect(linkLabel({ label: 'water gauge', url: 'https://waterdata.usgs.gov/x' })).toBe('water gauge')
  })
  it('falls back to the host, without the www', () => {
    expect(linkLabel({ label: '', url: 'https://www.ropewiki.com/Emerald' })).toBe('ropewiki.com')
  })
  it('shows the raw string when it is not a URL at all', () => {
    expect(linkLabel({ label: null, url: 'not a url' })).toBe('not a url')
  })
})

describe('phone', () => {
  it('normalises a US number to E.164', () => {
    expect(normalizePhone('(808) 555-1234')).toBe('+18085551234')
    expect(normalizePhone('1-808-555-1234')).toBe('+18085551234')
  })
  it('leaves something it does not recognise alone rather than mangling it', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
  })
  it('formats for reading', () => {
    expect(formatPhone('+18085551234')).toBe('(808) 555-1234')
  })
  it('has nothing to show for nothing', () => {
    expect(formatPhone(null)).toBe('')
  })
})

// What a tap on each piece of the field would actually dial.
const dials = (raw: string | null) => phoneParts(raw).filter((p) => p.href).map((p) => p.href)

describe('phoneParts', () => {
  it('leaves the label out of what gets dialed', () => {
    // A dialer spells letters out on the keypad: "Office:" dials 633423 first.
    expect(dials('Office: 757-421-1662')).toEqual(['tel:+17574211662'])
    expect(dials('Office: (909) 252 - 4100')).toEqual(['tel:+19092524100'])
  })
  it('gives two numbers on one line a link each', () => {
    expect(dials('Direct: 307.687.8452  |  Cell: 307-689-9997')).toEqual([
      'tel:+13076878452',
      'tel:+13076899997',
    ])
    expect(dials('307-555-0100, 307-555-0101')).toEqual(['tel:+13075550100', 'tel:+13075550101'])
  })
  it('keeps an extension out of the number rather than dialing it', () => {
    expect(dials('307-555-0100 ext 204')).toEqual(['tel:+13075550100'])
  })
  it('puts back everything that was typed, dialable or not', () => {
    const raw = 'Direct: 307.687.8452  |  Cell: 307-689-9997'
    expect(phoneParts(raw).map((p) => p.text).join('')).toBe(raw)
  })
  it('takes a number already stored clean', () => {
    expect(dials('13072674815')).toEqual(['tel:+13072674815'])
    expect(dials('207-735-5129.')).toEqual(['tel:+12077355129'])
    expect(dials('+44 20 7946 0958')).toEqual(['tel:+442079460958'])
  })
  it('has nothing to dial when there is no number', () => {
    expect(dials('signal only')).toEqual([])
    expect(dials('')).toEqual([])
    expect(dials(null)).toEqual([])
  })
})
