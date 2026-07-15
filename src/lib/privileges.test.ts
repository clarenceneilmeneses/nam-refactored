import { describe, expect, it } from 'vitest'
import { canEnterSi, canMarkPaid, canReviewSi, paidBlockReason, unpaidBlockReason } from './privileges'
import type { PrivilegeName, SaleRow } from '@/types/database'

const granted = (...names: PrivilegeName[]) => new Set<PrivilegeName>(names)
const none = granted()

const sale = (o: Partial<SaleRow> = {}) =>
  ({ si_number: 'SI-1001', si_reviewed: true, ...o }) as SaleRow

describe('privilege checks', () => {
  it('each privilege stands alone — one grant never implies another', () => {
    expect(canEnterSi(granted('enter_si'))).toBe(true)
    expect(canReviewSi(granted('enter_si'))).toBe(false)
    expect(canMarkPaid(granted('enter_si'))).toBe(false)

    expect(canReviewSi(granted('review_si'))).toBe(true)
    expect(canEnterSi(granted('review_si'))).toBe(false)

    expect(canMarkPaid(granted('mark_paid'))).toBe(true)
    expect(canEnterSi(granted('mark_paid'))).toBe(false)
  })

  it('grants nothing to a user with no grants', () => {
    expect(canEnterSi(none)).toBe(false)
    expect(canReviewSi(none)).toBe(false)
    expect(canMarkPaid(none)).toBe(false)
  })
})

describe('paidBlockReason', () => {
  it('lets the mark_paid holder mark a reviewed record Paid', () => {
    expect(paidBlockReason(granted('mark_paid'), sale())).toBeNull()
  })

  it('blocks anyone without mark_paid, even on a reviewed record', () => {
    expect(paidBlockReason(none, sale())).toMatch(/assigned SI reviewer/)
    expect(paidBlockReason(granted('enter_si', 'review_si'), sale())).toMatch(/assigned SI reviewer/)
  })

  it('blocks until an SI # exists', () => {
    expect(paidBlockReason(granted('mark_paid'), sale({ si_number: null }))).toMatch(/needs an SI #/)
    expect(paidBlockReason(granted('mark_paid'), sale({ si_number: '' }))).toMatch(/needs an SI #/)
  })

  it('blocks until the SI # is reviewed', () => {
    expect(paidBlockReason(granted('mark_paid'), sale({ si_reviewed: false }))).toMatch(/must be reviewed/)
  })

  it('fails closed on a missing review value', () => {
    // si_reviewed is NOT NULL DEFAULT false in the database, so this shouldn't
    // occur — but anything other than an explicit true must not open the gate.
    expect(paidBlockReason(granted('mark_paid'), sale({ si_reviewed: null as unknown as boolean }))).toMatch(
      /must be reviewed/,
    )
    expect(paidBlockReason(granted('mark_paid'), sale({ si_reviewed: undefined as unknown as boolean }))).toMatch(
      /must be reviewed/,
    )
  })

  it('reports the identity problem before the workflow problem', () => {
    // Someone with no grants on an unreviewed record should be told the rule
    // that actually applies to them, not sent chasing a review.
    expect(paidBlockReason(none, sale({ si_number: null, si_reviewed: false }))).toMatch(/assigned SI reviewer/)
  })
})

describe('unpaidBlockReason', () => {
  it('lets only the mark_paid holder revert a record out of Paid', () => {
    expect(unpaidBlockReason(granted('mark_paid'))).toBeNull()
    expect(unpaidBlockReason(none)).toMatch(/Paid status/)
    expect(unpaidBlockReason(granted('enter_si', 'review_si'))).toMatch(/Paid status/)
  })
})
