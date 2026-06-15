import bcrypt from 'bcryptjs'

// Password hashing helpers. This is a client-side demo (no backend), so hashing
// runs in the browser via bcryptjs. The point is that stored credentials are
// bcrypt hashes, never plaintext — even though comparison happens client-side.

const SALT_ROUNDS = 10

/** True if the value already looks like a bcrypt hash (so we never double-hash). */
export function isHashed(value: string): boolean {
  return /^\$2[aby]\$/.test(value)
}

/** Hash a plaintext password. Idempotent: an already-hashed value is returned as-is. */
export function hashPassword(plaintext: string): string {
  if (!plaintext) return plaintext
  return isHashed(plaintext) ? plaintext : bcrypt.hashSync(plaintext, SALT_ROUNDS)
}

/**
 * Verify an entered password against a stored value.
 * Falls back to a plaintext comparison if the stored value isn't hashed yet
 * (backward-compat for any record not migrated) so login never silently breaks.
 */
export function verifyPassword(entered: string, stored: string): boolean {
  if (!stored) return false
  return isHashed(stored) ? bcrypt.compareSync(entered, stored) : entered === stored
}
