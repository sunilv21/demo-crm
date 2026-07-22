// Decrypts mailbox passwords for the scheduled IMAP sync (syncInboxes in
// inbox-sync.ts). This is a Cloud Functions-only copy of
// src/lib/mailbox-crypto.ts — the two deployable units (Next.js app, Cloud
// Functions) don't share code, so keep both in sync if either changes.
//
// The key comes from Secret Manager (defineSecret), NOT the Next.js app's
// .env — the two must hold the IDENTICAL base64 key value, set once via:
//   firebase functions:secrets:set MAILBOX_ENCRYPTION_KEY

import crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';

export const MAILBOX_ENCRYPTION_KEY = defineSecret('MAILBOX_ENCRYPTION_KEY');

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function decryptSecret(input: EncryptedSecret): string {
  const key = Buffer.from(MAILBOX_ENCRYPTION_KEY.value(), 'base64');
  if (key.length !== 32) {
    throw new Error('MAILBOX_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(input.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(input.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
