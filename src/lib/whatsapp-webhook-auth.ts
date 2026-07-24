// Server-only. Signature verification for the two public WhatsApp webhook
// routes (src/app/api/webhooks/whatsapp/**) — these have no Firebase auth
// (external services call them), so a valid signature is the only thing
// standing between "real WhatsApp message" and "anyone can POST fake data
// into whatsapp_messages."

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { decryptSecret } from '@/lib/mailbox-crypto';

/**
 * Reconstructs the PUBLIC url a request actually came in on, rather than
 * trusting req.url — which behind a tunnel like ngrok reflects the literal
 * local connection (e.g. "http://localhost:9002/...") since ngrok terminates
 * TLS at its own edge and forwards plain HTTP locally. Used both to verify
 * Twilio's request signature (it signs the public https:// URL it called)
 * and to build the status-callback URL we hand back to Twilio at send time,
 * so it always points at whichever tunnel/domain is currently live without
 * needing a separate env var that goes stale the moment ngrok restarts.
 */
export function publicUrlFor(req: NextRequest, pathname?: string): string {
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  return `${proto}://${host}${pathname ?? req.nextUrl.pathname}${pathname ? '' : req.nextUrl.search}`;
}

const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/i;

/**
 * Builds a URL Twilio/Meta can actually reach for status callbacks — unlike
 * publicUrlFor() (used by the webhook routes themselves, which really are
 * called through the tunnel), the send route is called by the *browser*
 * talking to the app directly, so its req reflects localhost, not the
 * public tunnel URL. Twilio flatly rejects a StatusCallback pointing at
 * localhost (error 21609), which broke sending entirely, not just receipts
 * — so this fails safe: if there's no reliable public URL, it returns null
 * and the caller omits the status callback rather than breaking the send.
 * Set WHATSAPP_PUBLIC_BASE_URL to the current ngrok/production URL to get
 * delivery receipts; without it, sending still works, just without them.
 */
export function publicBaseUrlOrNull(req: NextRequest): string | null {
  const configured = process.env.WHATSAPP_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  if (!host || LOCAL_HOST_PATTERN.test(host)) return null;
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** Reads the global Meta Cloud API settings doc (App Secret + verify token). */
export async function getMetaSettings(): Promise<{ appSecret: string | null; verifyToken: string | null }> {
  const snap = await adminDb().doc('whatsapp_settings/meta_cloud').get();
  const data = snap.data();
  if (!data) return { appSecret: null, verifyToken: null };
  const appSecret =
    data.appSecretCiphertext && data.appSecretIv && data.appSecretAuthTag
      ? decryptSecret({
          ciphertext: data.appSecretCiphertext,
          iv: data.appSecretIv,
          authTag: data.appSecretAuthTag,
        })
      : null;
  return { appSecret, verifyToken: data.verifyToken ?? null };
}

/** Meta signs the raw webhook body with the App Secret — HMAC-SHA256, hex, prefixed "sha256=". */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.slice('sha256='.length);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/**
 * Twilio signs the full callback URL + sorted form params with the
 * account's Auth Token — HMAC-SHA1, base64. Per Twilio's documented
 * algorithm: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null,
  authToken: string
): boolean {
  if (!signatureHeader) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('');
  const expected = crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
  if (expected.length !== signatureHeader.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
