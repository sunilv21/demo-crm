// Standalone copy of src/lib/firebase-admin.ts's Firestore init — this
// project isn't part of the Next.js app's module graph, so it can't import
// from src/lib directly. Same env var (FIREBASE_SERVICE_ACCOUNT_BASE64),
// copied into whatsapp-bridge/.env.

import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadServiceAccount(): ServiceAccount {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not configured.');
  }
  const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonStr) as ServiceAccount & { private_key?: string };
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

export const adminDb = () => getFirestore(getAdminApp());
