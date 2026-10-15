import { describe, expect, it } from 'vitest'

// The rule the add box seeds itself from. Kept here because it is the one bit
// of the links editor that is a judgement rather than markup: how much of a
// CalTopo address is the map, and how much is the permission.
const SHARED = /^(https?:\/\/(?:www\.)?(?:caltopo|sartopo)\.com\/m\/[A-Za-z0-9_-]+)(?:\/.*)?$/i
const prefix = (url: string) => { const m = url.match(SHARED); return m ? `${m[1]}/` : '' }

describe('the part of a map link that cannot change', () => {
  it('keeps the map id and drops the token', () => {
    expect(prefix('https://caltopo.com/m/0RU45GS/GFDA1DMN6DR026TM'))
      .toBe('https://caltopo.com/m/0RU45GS/')
  })

  it('works from a link that has no token yet', () => {
    expect(prefix('https://caltopo.com/m/0RU45GS')).toBe('https://caltopo.com/m/0RU45GS/')
  })

  it('handles sartopo and www the same way', () => {
    expect(prefix('https://sartopo.com/m/ABC123/tok')).toBe('https://sartopo.com/m/ABC123/')
    expect(prefix('https://www.caltopo.com/m/ABC123/tok')).toBe('https://www.caltopo.com/m/ABC123/')
  })

  it('seeds nothing for anything else, rather than guessing at a prefix', () => {
    expect(prefix('https://drive.google.com/file/d/xyz/view')).toBe('')
    expect(prefix('https://ropewiki.com/Dingford_Creek')).toBe('')
  })
})
