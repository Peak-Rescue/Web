import { describe, it, expect } from 'vitest'
import { chooseRecipients, numberSoFar } from '@/lib/billing'
import { pickBillableQuote } from '@/lib/billing-handoff'

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

describe('which quote a course is billed against', () => {
  const q = (seq: number, status: string, total = 12800, archived_at: string | null = null) =>
    ({ quote_seq: seq, status, total, archived_at })
  // Newest first, as both call sites order them.
  const newestFirst = (...qs: ReturnType<typeof q>[]) => [...qs].sort((a, b) => b.quote_seq - a.quote_seq)

  it('takes the accepted quote when it is the only one out', () => {
    expect(pickBillableQuote(newestFirst(q(1, 'accepted')))?.quote_seq).toBe(1)
  })

  it('moves to a re-quote the moment it goes out, accepted or not', () => {
    // The whole reason for this file. Q1 was accepted, the client changed the
    // details, Q2 went out — and billing was still stamping Q1.
    const picked = pickBillableQuote(newestFirst(q(1, 'accepted', 12800), q(2, 'sent', 14400)))
    expect(picked?.quote_seq).toBe(2)
    expect(picked?.total).toBe(14400)
  })

  it('says out loud that the number nobody has agreed to is not agreed', () => {
    const picked = pickBillableQuote(newestFirst(q(1, 'accepted'), q(2, 'sent', 14400)))!
    expect(numberSoFar({ quote: { seq: picked.quote_seq, total: picked.total, status: picked.status } })?.text)
      .toBe('Quote 2 was sent at')
  })

  it('goes back to the accepted one when the re-quote is refused', () => {
    // Declined and expired are not supersessions — that number was refused.
    for (const dead of ['declined', 'expired']) {
      expect(pickBillableQuote(newestFirst(q(1, 'accepted'), q(2, dead, 14400)))?.quote_seq).toBe(1)
    }
  })

  it('ignores a draft sitting on top of an accepted quote', () => {
    // A draft has not left the building, so it supersedes nothing.
    expect(pickBillableQuote(newestFirst(q(1, 'accepted'), q(2, 'draft', 14400)))?.quote_seq).toBe(1)
  })

  it('still offers a draft when nothing has ever been sent', () => {
    expect(pickBillableQuote(newestFirst(q(1, 'draft')))?.quote_seq).toBe(1)
  })

  it('offers nothing rather than the superseded price when the re-quote has no figure yet', () => {
    // An options re-quote nobody has picked from totals 0. Falling back to Q1
    // would bill the course we are no longer running.
    expect(pickBillableQuote(newestFirst(q(1, 'accepted'), q(2, 'sent', 0)))).toBeNull()
  })

  it('skips an archived re-quote, whose COAs have all been set aside', () => {
    expect(pickBillableQuote(newestFirst(q(1, 'accepted'), q(2, 'sent', 14400, '2026-09-01')))?.quote_seq).toBe(1)
  })

  it('takes the newest of two accepted quotes', () => {
    expect(pickBillableQuote(newestFirst(q(1, 'accepted'), q(2, 'accepted', 14400)))?.quote_seq).toBe(2)
  })

  it('has nothing to offer on a course booked with no quote', () => {
    expect(pickBillableQuote([])).toBeNull()
  })
})
