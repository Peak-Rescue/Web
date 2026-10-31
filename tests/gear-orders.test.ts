import { describe, expect, it } from 'vitest'
import { brandsIn, canonicalBrand } from '@/lib/gear'
import { cleanSizes, defaultScale, lineNames, orderTotal, parseSizeOptions, safeLink, sizeRange, sizeRows, sizesSummary, sizesTotal } from '@/lib/gear-orders'

describe('orderTotal', () => {
  it('adds up the lines still wanted', () => {
    expect(orderTotal([
      { qty: 2, removed: false, unit_price: 59 },
      { qty: 1, removed: false, unit_price: 449.5 },
    ])).toEqual({ total: 567.5, unpriced: 0, anyPriced: true })
  })

  it('leaves out struck-off lines and lines nobody asked for', () => {
    const { total, unpriced } = orderTotal([
      { qty: 2, removed: true, unit_price: 100 },
      { qty: 0, removed: false, unit_price: 100 },
      { qty: null, removed: false, unit_price: null },
      { qty: 1, removed: false, unit_price: 10 },
    ])
    expect(total).toBe(10)
    expect(unpriced).toBe(0)
  })

  it('counts a wanted line with no price rather than skipping it quietly', () => {
    const { total, unpriced } = orderTotal([
      { qty: 6, removed: false, unit_price: null },
      { qty: 1, removed: false, unit_price: 10 },
    ])
    expect(total).toBe(10)
    expect(unpriced).toBe(1)
  })

  it('does not drift on cents', () => {
    expect(orderTotal([{ qty: 3, removed: false, unit_price: 19.99 }]).total).toBe(59.97)
  })

  it('says when nothing is priced, so a course order shows no $0.00', () => {
    expect(orderTotal([{ qty: 3, removed: false }]).anyPriced).toBe(false)
  })
})

describe('safeLink', () => {
  it('keeps web addresses', () => {
    expect(safeLink(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1')
  })

  it('refuses anything a client page should not make clickable', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull()
    expect(safeLink('example.com')).toBeNull()
    expect(safeLink('')).toBeNull()
    expect(safeLink(null)).toBeNull()
  })
})

describe('lineNames', () => {
  it('leads with what is needed and names the product second', () => {
    expect(lineNames({ name: 'Recon Stretch Shell', brand: 'Black Diamond' }, { name: 'Waterproof shell jacket' }))
      .toEqual({ name: 'Waterproof shell jacket', product: 'Black Diamond Recon Stretch Shell' })
  })

  it('leaves a generic item with no product yet', () => {
    expect(lineNames({ name: 'Skis' }, null)).toEqual({ name: 'Skis', product: null })
  })
})

describe('sizes', () => {
  it('reads a typed list, keeping spaces and dropping repeats', () => {
    expect(parseSizeOptions(' S, m ,M, 10.5 wide,, ')).toEqual(['S', 'm', '10.5 wide'])
  })

  it('stores only real answers, and one row per size', () => {
    expect(cleanSizes([
      { size: 'M', qty: '2' }, { size: 'm', qty: 1 }, { size: 'L', qty: '' }, { size: '', qty: 3 }, { size: 'XL', qty: -1 },
    ])).toEqual([{ size: 'M', qty: 3 }])
    expect(cleanSizes(null)).toEqual([])
  })

  it('adds up to the line total', () => {
    expect(sizesTotal([{ qty: '2' }, { qty: 4 }, { qty: '' }])).toBe(6)
  })

  it('summarises for the PDF and the email', () => {
    expect(sizesSummary([{ size: 'M', qty: 2 }, { size: 'L', qty: 4 }])).toBe('M × 2, L × 4')
    expect(sizesSummary([])).toBeNull()
  })

  it('draws a box per known size, and keeps an answer the list no longer holds', () => {
    expect(sizeRows(['S', 'M'], [{ size: 'M', qty: 2 }, { size: 'XXL', qty: 1 }])).toEqual([
      { size: 'S', qty: '' }, { size: 'M', qty: '2' }, { size: 'XXL', qty: '1' },
    ])
    expect(sizeRows([], null)).toEqual([])
  })
})

describe('size ranges', () => {
  it('writes out clothing from one size to another', () => {
    expect(sizeRange('letter', 'S', 'XL', 1)).toEqual(['S', 'M', 'L', 'XL'])
    expect(sizeRange('letter', 'XL', 'S', 1)).toEqual(['S', 'M', 'L', 'XL'])
  })

  it('writes out footwear, half sizes included', () => {
    expect(sizeRange('eu', 42, 44, 1)).toEqual(['EU 42', 'EU 43', 'EU 44'])
    expect(sizeRange('us', 9, 10, 0.5)).toEqual(['US 9', 'US 9.5', 'US 10'])
  })

  it('writes out ski boots in mondo', () => {
    expect(sizeRange('mondo', 26, 27, 0.5)).toEqual(['Mondo 26', 'Mondo 26.5', 'Mondo 27'])
  })

  it('steps rope by the length', () => {
    expect(sizeRange('metres', 30, 60, 10)).toEqual(['30 m', '40 m', '50 m', '60 m'])
    expect(sizeRange('metres', 30, 40, 5)).toEqual(['30 m', '35 m', '40 m'])
  })

  it('gives nothing for a range that is not one', () => {
    expect(sizeRange('metres', '', 60, 10)).toEqual([])
    expect(sizeRange('letter', 'nope', 'XL', 1)).toEqual([])
  })

  it('stays within what a line can hold', () => {
    expect(sizeRange('metres', 1, 100000, 5)).toHaveLength(50)
  })

  it('opens on the likely scale', () => {
    expect(defaultScale({ category: 'Rope and cord', name: 'Static rope' })).toBe('metres')
    expect(defaultScale({ category: 'Snow travel', name: 'Ski boots' })).toBe('mondo')
    expect(defaultScale({ category: 'Clothing and exposure', name: 'Mountain boot' })).toBe('eu')
    expect(defaultScale({ category: 'Clothing and exposure', name: 'Gloves' })).toBe('letter')
  })
})

describe('canonicalBrand', () => {
  const held = ['Black Diamond', 'Petzl', null]

  it('files a different typing under the spelling already in use', () => {
    expect(canonicalBrand('black diamond', held)).toBe('Black Diamond')
    expect(canonicalBrand(' BlackDiamond ', held)).toBe('Black Diamond')
    expect(canonicalBrand('Black-Diamond', held)).toBe('Black Diamond')
  })

  it('keeps a brand it has not seen, tidied', () => {
    expect(canonicalBrand('  La   Sportiva ', held)).toBe('La Sportiva')
  })
})

describe('brandsIn', () => {
  it('lists each brand once, in order', () => {
    expect(brandsIn([{ brand: 'Petzl' }, { brand: null }, { brand: 'Camp' }, { brand: 'Petzl ' }])).toEqual(['Camp', 'Petzl'])
  })
})
