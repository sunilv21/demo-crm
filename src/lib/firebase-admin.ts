// Server-only Firebase Admin SDK initialization.
//
// Used by API routes that need privileged operations the client SDK can't do
// (e.g. an admin setting another user's password). NEVER import this from a
// client component — it requires the service-account secret.
//
// Provide the service account via ONE of these environment variables:
//   FIREBASE_SERVICE_ACCOUNT_BASE64  — base64 of the service-account JSON file
//                                      (recommended; avoids newline/quote issues)
//   FIREBASE_SERVICE_ACCOUNT         — the raw service-account JSON string
//
// Generate the key in Firebase Console → Project Settings → Service accounts →
// "Generate new private key". Then, to base64 it:  `base64 -w0 serviceAccount.json`

import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loadServiceAccount(): ServiceAccount {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  let jsonStr: string | undefined;
  if (b64) {
    jsonStr = Buffer.from(b64, 'base64').toString('utf8');
  } else if (raw) {
    jsonStr = raw;
  }

  if (!jsonStr) {
    throw new Error(
      'Firebase Admin credentials missing. Set FIREBASE_SERVICE_ACCOUNT_BASE64 (or FIREBASE_SERVICE_ACCOUNT).'
    );
  }

  const parsed = JSON.parse(jsonStr) as ServiceAccount & { private_key?: string };
  // When the key is provided as a raw JSON string in an env var, its newlines
  // are often escaped as literal "\n" — restore them so the cert is valid.
  if (typeof parsed.private_key === 'string' && parsed.private_key.includes('\\n')) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0]!;
  return initializeApp({ credential: cert(loadServiceAccount()) });
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
