/**
 * Person-specific privileges that a role/permission can't express.
 *
 * Allyson and Jessel both sit on the Super Admin role (shared by ~10 accounts),
 * so these two rules are keyed to their specific legacy user ids (users.id):
 *   - Only Allyson may fill in a record's SI # (records tab).
 *   - A record may only be marked Paid after Jessel has reviewed its SI #.
 *
 * Change the ids here if either account is ever replaced.
 */
import type { Profile } from '@/hooks/useAuth'

/** users.id of Ms. Allyson Ashley Aguilera ("ally"). */
export const SI_ENTRY_USER_ID = 6
/** users.id of Ms. Jessel Rose Genotiva ("jessel"). */
export const SI_REVIEW_USER_ID = 18

/** True only for Allyson — the sole person allowed to enter/edit the SI #. */
export function canEnterSi(profile: Profile | null): boolean {
  return profile?.id === SI_ENTRY_USER_ID
}

/** True only for Jessel — the sole person allowed to review/approve an SI #. */
export function canReviewSi(profile: Profile | null): boolean {
  return profile?.id === SI_REVIEW_USER_ID
}
