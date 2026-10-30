import { describe, it, expect } from 'vitest'
import { pinFromCoords, pinFromGoogleUrl, isGoogleMapsUrl } from '@/lib/pin'

describe('pins', () => {
  it('reads typed coordinates in the shapes people paste', () => {
    expect(pinFromCoords('20.9227033, -156.2858675')).toBe('20.92270,-156.28587')
    expect(pinFromCoords('20.9227,-156.2858')).toBe('20.92270,-156.28580')
    expect(pinFromCoords('20.9227 -156.2858')).toBe('20.92270,-156.28580')
    expect(pinFromCoords('Jaws Country Store')).toBeNull()
    expect(pinFromCoords('120.1, 10')).toBeNull()
  })

  it('takes the place over the map centre', () => {
    const url = 'https://www.google.com/maps/place/Jaws+Country+Store/@20.9,-156.2,17z/data=!3m1!4b1!4m6!3m5!1s0x7e:0x70!8m2!3d20.9227033!4d-156.2858675!16s'
    expect(pinFromGoogleUrl(url)).toBe('20.92270,-156.28587')
    expect(pinFromGoogleUrl('https://www.google.com/maps/@20.9227,-156.2858,15z')).toBe('20.92270,-156.28580')
    expect(pinFromGoogleUrl('https://www.google.com/maps/search/?api=1&query=20.9227%2C-156.2858')).toBe('20.92270,-156.28580')
    expect(pinFromGoogleUrl('https://maps.app.goo.gl/DnfaazfHTWb3s3wAA')).toBeNull()
  })

  it('only follows Google', () => {
    expect(isGoogleMapsUrl('https://maps.app.goo.gl/DnfaazfHTWb3s3wAA')).toBe(true)
    expect(isGoogleMapsUrl('https://www.google.com/maps/place/x')).toBe(true)
    expect(isGoogleMapsUrl('https://www.google.com/search?q=x')).toBe(false)
    expect(isGoogleMapsUrl('https://evil.example/maps')).toBe(false)
    expect(isGoogleMapsUrl('http://maps.app.goo.gl/x')).toBe(false)
  })
})
