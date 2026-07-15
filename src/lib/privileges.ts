/**
 * The SI # workflow rules, in one place.
 *
 *   enter_si   fill in / change a record's SI #
 *   review_si  mark an SI # reviewed
 *   mark_paid  change a record's Paid status, once its SI # is reviewed
 *
 * These are person-level grants (user_privileges), not role permissions: the
 * encoder and reviewer share the Super Admin role with ~8 other accounts, so a
 * role could never isolate them. Reassign from the Roles tab — nothing here is
 * keyed to a person, and Super Admin does not implicitly hold any of them.
 *
 * The database enforces the same three rules via the sales_si_privileges
 * trigger (12_si_privileges.sql); these functions exist so the UI can explain
 * the rule up front instead of surfacing a Postgres error.
 */
import type { PrivilegeName, SaleRow } from '@/types/database'

type Privileges = ReadonlySet<PrivilegeName>

/** May fill in / change a record's SI #. */
export function canEnterSi(privileges: Privileges): boolean {
  return privileges.has('enter_si')
}

/** May mark an SI # reviewed. */
export function canReviewSi(privileges: Privileges): boolean {
  return privileges.has('review_si')
}

/** May change a record's Paid status — subject to paidBlockReason. */
export function canMarkPaid(privileges: Privileges): boolean {
  return privileges.has('mark_paid')
}

type PaidGateSale = Pick<SaleRow, 'si_number' | 'si_reviewed'>

/**
 * Why this user may not mark `sale` Paid, or null when it's allowed.
 * Mirrors the order the database trigger checks in, so the toast a user sees
 * matches the error they'd have hit anyway.
 */
export function paidBlockReason(privileges: Privileges, sale: PaidGateSale): string | null {
  if (!canMarkPaid(privileges)) return 'Only the assigned SI reviewer can mark a record as Paid.'
  if (!sale.si_number) return 'This record needs an SI # from the assigned SI encoder before it can be marked Paid.'
  if (sale.si_reviewed !== true) return 'This record’s SI # must be reviewed before it can be marked Paid.'
  return null
}

/** Why this user may not revert `sale` out of Paid, or null when it's allowed. */
export function unpaidBlockReason(privileges: Privileges): string | null {
  // Reverting Paid unwinds the reviewer's approval, so it's theirs too.
  return canMarkPaid(privileges) ? null : 'Only the assigned SI reviewer can change a record’s Paid status.'
}
