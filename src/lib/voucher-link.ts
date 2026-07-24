// Server-only. Short-lived signed links for the public voucher-file route
// (src/app/api/vouchers/[bookingId]/file) — Twilio/Meta fetch a document
// message's media from a URL over the open internet, so that route can't sit
// behind Firebase auth like the rest of the app. A signed, expiring token is
// what stops it from being an open "read anyone's booking voucher" endpoint:
// HMAC-SHA256 over bookingId+expiry using MAILBOX_ENCRYPTION_KEY (already a
// server-only secret in this app, reused rather than adding a new one).

import crypto from 'crypto';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes — comfortably longer than Twilio/Meta take to fetch media after a send.

function sign(bookingId: string, expiresAt: number): string {
  const key = process.env.MAILBOX_ENCRYPTION_KEY;
  if (!key) throw new Error('MAILBOX_ENCRYPTION_KEY is not set.');
  return crypto.createHmac('sha256', key).update(`${bookingId}.${expiresAt}`).digest('hex');
}

export function createVoucherLink(bookingId: string, ttlMs: number = DEFAULT_TTL_MS): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + ttlMs;
  return { token: sign(bookingId, expiresAt), expiresAt };
}

export function verifyVoucherLink(bookingId: string, token: string | null, expiresAtParam: string | null): boolean {
  if (!token || !expiresAtParam) return false;
  const expiresAt = Number(expiresAtParam);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = sign(bookingId, expiresAt);
  if (expected.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
