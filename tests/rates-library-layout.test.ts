import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

// The rates table is a grid whose cells come from three different places: a
// form that is display:contents, a toggle that fires its own action, and a
// button that is not in the form at all. Two invariants hold it together, and
// neither is visible from the markup of any single element — so they are
// checked here rather than discovered as a row on two lines again.

const page = readFileSync('app/admin/expenses/rates/page.tsx', 'utf8')
const toggle = readFileSync('app/admin/expenses/rates/DefaultLineToggle.tsx', 'utf8')
const categoryRow = readFileSync('app/admin/expenses/rates/CostCategoryRow.tsx', 'utf8')

const rateRow = page.slice(
  page.indexOf('{pricingRates.map((r) => ('),
  page.indexOf('{pricingRates.length === 0')
)
const columns = (name: string) => {
  const tpl = new RegExp(`${name} =\\s*\\n?\\s*'([^']+)'`).exec(page)![1]
  return /grid-cols-\[([^\]]+)\]/.exec(tpl)![1].split('_')
}

describe('the rates row grid', () => {
  it('has as many header cells as columns', () => {
    const header = /hidden \$\{RATE_GRID\}[^>]*>([\s\S]*?)\n {10}<\/div>/.exec(page)![1]
    expect(header.match(/<span/g)!).toHaveLength(columns('RATE_GRID').length)
  })

  it('places nothing by hand', () => {
    // Auto-placement only walks forward. A cell pinned to a later column
    // leaves the cursor past the earlier ones, and anything pinned behind it
    // starts a new row — which is how this table ended up two lines deep.
    expect(rateRow).not.toMatch(/col-start-/)
  })

  it('lists its cells in the order the columns run', () => {
    const order = [...rateRow.matchAll(/name="(\w+)"|<(DefaultLineToggle|SaveButton)/g)].map(
      (m) => m[1] ?? m[2]
    )
    expect(order).toEqual(['label', 'unit', 'rate', 'pay_rate', 'DefaultLineToggle', 'SaveButton'])
  })
})

describe('the default-line tick box', () => {
  it('carries no name', () => {
    // FormData skips unnamed controls. That is what keeps this out of the
    // rate's submitted values and out of what Save counts as an edit, while
    // still letting it sit inside the form to land in the right column.
    expect(toggle).not.toMatch(/name=/)
  })
})

describe('the cost category row grid', () => {
  it('has as many header cells as columns', () => {
    const header = /hidden \$\{CATEGORY_GRID\}[^>]*>([\s\S]*?)\n {12}<\/div>/.exec(page)![1]
    expect(header.match(/<span/g)!).toHaveLength(columns('CATEGORY_GRID').length)
  })

  it('places nothing by hand either', () => {
    expect(categoryRow).not.toMatch(/col-start-/)
  })
})
