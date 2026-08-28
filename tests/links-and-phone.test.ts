import { describe, it, expect } from 'vitest'
import { linkLabel } from '@/lib/course-links'
import { normalizePhone, formatPhone } from '@/lib/phone'

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
