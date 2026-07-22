// Server-only. Encrypts/decrypts mailbox passwords at rest (AES-256-GCM).
//
// NEVER import this from a client component — it reads MAILBOX_ENCRYPTION_KEY,
// a server-only secret. Only src/app/api/** routes should import it.
//
// The Cloud Function in functions/src/inbox-sync.ts needs to decrypt the same
// ciphertexts to poll IMAP on a schedule, so it holds an independent copy of
// this same logic + the same key value (set via `firebase functions:secrets:set
// MAILBOX_ENCRYPTION_KEY`). Keep the two key values in sync — there's no
// automatic sharing between the Next.js app and Cloud Functions in this repo.

import crypto from 'crypto';

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64, 12 bytes
  authTag: string; // base64, 16 bytes
}

function getKey(): Buffer {
  const b64 = process.env.MAILBOX_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      'MAILBOX_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.'
    );
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('MAILBOX_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  return key;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(input: EncryptedSecret): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(input.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(input.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
