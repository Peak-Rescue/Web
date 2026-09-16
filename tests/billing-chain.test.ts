import { describe, it, expect } from 'vitest'
import { chooseRecipients, numberSoFar } from '@/lib/billing'

const billed = { total: 13200, count: 1 }
const quote = { seq: 2, total: 12800, status: 'accepted' }
const estimate = { title: 'COA 1', total: 12000 }

describe('the number, as far along the chain as it has got', () => {
  it('prefers what Harken was actually asked to invoice', () => {
    expect(numberSoFar({ billed, quote, estimate })).toEqual({
      total: 13200,
      text: 'Harken was asked to invoice',
    })
  })

  it('adds up two invoices, because two invoices are two invoices', () => {
    expect(numberSoFar({ billed: { total: 16000, count: 2 } })).toEqual({
      total: 16000,
      text: '2 invoices went to Harken totalling',
    })
  })

  it('falls back past a step that never happened', () => {
    // A course booked against a PO: no quote was ever raised here.
    expect(numberSoFar({ quote: null, estimate })).toEqual({
      total: 12000,
      text: 'COA 1 prices this at',
    })
  })

  it('reaches the estimate when neither of the steps between exists', () => {
    expect(numberSoFar({ billed: null, quote: null, estimate })?.total).toBe(12000)
  })

  it('always says where the number came from', () => {
    // An estimate handed over as a bare figure would read as an agreed price.
    for (const link of [
      numberSoFar({ billed }),
      numberSoFar({ quote }),
      numberSoFar({ estimate }),
    ]) {
      expect(link?.text).toBeTruthy()
    }
  })

  it('says how a quote stands, so a draft is never mistaken for agreement', () => {
    expect(numberSoFar({ quote: { ...quote, status: 'draft' } })?.text).toBe('Quote 2 is a draft at')
    expect(numberSoFar({ quote: { ...quote, status: 'sent' } })?.text).toBe('Quote 2 was sent at')
  })

  it('offers nothing rather than zero when the chain is empty', () => {
    expect(numberSoFar({})).toBeNull()
    // An options quote nobody has picked from is a total of zero, which is not
    // a number anybody agreed to.
    expect(numberSoFar({ quote: { seq: 1, total: 0, status: 'sent' } })).toBeNull()
    expect(numberSoFar({ billed: { total: 0, count: 0 }, estimate })?.total).toBe(12000)
  })
})

describe('who a handoff is mailed to', () => {
  const kallie = { id: 'k', name: 'Kallie Hunt' }
  const nadav = { id: 'n', name: 'Nadav Oakes' }
  const active = [kallie, nadav]

  it('tells everybody when nobody has been singled out', () => {
    // What one biller has always meant, and what a course sent before the
    // checkboxes existed meant too.
    expect(chooseRecipients(active, undefined)).toEqual(active)
    expect(chooseRecipients(active, [])).toEqual(active)
  })

  it('tells only the ones ticked', () => {
    expect(chooseRecipients(active, ['n'])).toEqual([nadav])
  })

  it('keeps the order the page showed them in', () => {
    expect(chooseRecipients(active, ['n', 'k'])).toEqual([kallie, nadav])
  })

  it('drops an id that is no longer an active biller', () => {
    // A screen left open across a deactivation should stop mailing somebody
    // who is gone, not lose the request.
    expect(chooseRecipients(active, ['k', 'gone'])).toEqual([kallie])
  })

  it('chooses nobody when every ticked biller has gone, so the send refuses', () => {
    expect(chooseRecipients(active, ['gone'])).toEqual([])
  })
})
