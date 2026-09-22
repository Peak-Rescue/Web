import { describe, it, expect } from 'vitest'
import { linkLabel } from '@/lib/course-links'
import { normalizePhone, formatPhone, phoneHref } from '@/lib/phone'

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

describe('phoneHref', () => {
  it('leaves the label out of what gets dialed', () => {
    // A dialer spells letters out on the keypad: "Office:" dials 633423 first.
    expect(phoneHref('Office: 757-421-1662')).toBe('tel:+17574211662')
    expect(phoneHref('Office: (909) 252 - 4100')).toBe('tel:+19092524100')
  })
  it('dials the first of two numbers rather than both run together', () => {
    expect(phoneHref('Direct: 307.687.8452  |  Cell: 307-689-9997')).toBe('tel:+13076878452')
    expect(phoneHref('307-555-0100 ext 204')).toBe('tel:+13075550100')
  })
  it('takes a number already stored clean', () => {
    expect(phoneHref('13072674815')).toBe('tel:+13072674815')
    expect(phoneHref('207-735-5129.')).toBe('tel:+12077355129')
    expect(phoneHref('+44 20 7946 0958')).toBe('tel:+442079460958')
  })
  it('has nothing to dial when there is no number', () => {
    expect(phoneHref('signal only')).toBe(null)
    expect(phoneHref('')).toBe(null)
    expect(phoneHref(null)).toBe(null)
  })
})
