import { describe, it, expect } from 'vitest'
import { splitLinks, shortUrl, urlsIn } from '@/lib/linkify'

const links = (t: string) => splitLinks(t).flatMap((p) => ('url' in p ? [p.url] : []))
const words = (t: string) => splitLinks(t).map((p) => ('url' in p ? `[${p.url}]` : p.text)).join('')

describe('splitLinks', () => {
  it('leaves prose with no URL in one piece', () => {
    expect(splitLinks('lower lot, by the big cedar')).toEqual([{ text: 'lower lot, by the big cedar' }])
  })

  it('pulls a URL out of the middle of a sentence and keeps the words either side', () => {
    expect(words('park here https://maps.app.goo.gl/x then walk in'))
      .toBe('park here [https://maps.app.goo.gl/x] then walk in')
  })

  it('gives the sentence back its punctuation', () => {
    expect(links('meet at https://maps.app.goo.gl/x, then walk in')).toEqual(['https://maps.app.goo.gl/x'])
    expect(links('gauge is https://waterdata.usgs.gov/nwis/uv?site=123.')).toEqual([
      'https://waterdata.usgs.gov/nwis/uv?site=123',
    ])
  })

  it('keeps a closing bracket the URL opened', () => {
    expect(links('see https://en.wikipedia.org/wiki/Emerald_(canyon)')).toEqual([
      'https://en.wikipedia.org/wiki/Emerald_(canyon)',
    ])
  })

  it('does not take a bracket that belongs to the sentence', () => {
    expect(links('(gauge: https://waterdata.usgs.gov/x)')).toEqual(['https://waterdata.usgs.gov/x'])
  })

  it('finds more than one', () => {
    expect(links('pin https://a.com/x and gauge https://b.com/y')).toEqual([
      'https://a.com/x',
      'https://b.com/y',
    ])
  })

  // The scheme is the signal that someone meant a link — otherwise "etc." and
  // a file name become links.
  it('leaves a bare domain alone', () => {
    expect(links('beta is on ropewiki.com under Emerald')).toEqual([])
    expect(links('see notes.md and the gear list')).toEqual([])
  })

  it('keeps the line breaks the prose was typed with', () => {
    expect(words('lower lot\nhttps://a.com/x\nbring water'))
      .toBe('lower lot\n[https://a.com/x]\nbring water')
  })
})

describe('shortUrl', () => {
  it('drops the scheme and the www on something short enough to read', () => {
    expect(shortUrl('https://www.ropewiki.com/Emerald')).toBe('ropewiki.com/Emerald')
  })

  it('is just the host when there is no path', () => {
    expect(shortUrl('https://ropewiki.com/')).toBe('ropewiki.com')
  })

  // Two map pins that both read as "google.com" tell you nothing apart, so the
  // segment that says which kind of thing it is survives the cut.
  it('cuts a long one to the host and the first segment', () => {
    expect(shortUrl('https://www.google.com/maps/place/Emerald+Pools/@37.2,-113.0,17z/data=!3m1!4b1!4m6'))
      .toBe('google.com/maps/…')
  })

  it('shows a string that is not a URL as it is', () => {
    expect(shortUrl('not a url')).toBe('not a url')
  })
})

describe('urlsIn', () => {
  it('lists each URL once, in the order it was typed', () => {
    expect(urlsIn('pin https://a.com/x, again https://a.com/x, gauge https://b.com/y'))
      .toEqual(['https://a.com/x', 'https://b.com/y'])
  })
})
