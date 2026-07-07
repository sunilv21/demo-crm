import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

// firebase-admin needs the Node.js runtime (not the Edge runtime).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/reset-password
 * Body: { uid: string, newPassword: string }
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Directly sets a target user's password. The caller must be signed in AND
 * have role === 'admin' in /users/{caller.uid}. Uses the Admin SDK, so no
 * current password is required — this is an admin-only privileged operation.
 */
export async function POST(req: NextRequest) {
  // 1. Authenticate the caller from their ID token.
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token.' }, { status: 401 });
  }

  let callerUid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired session. Sign in again.' }, { status: 401 });
  }

  // 2. Authorize: caller must be an admin.
  try {
    const callerSnap = await adminDb().doc(`users/${callerUid}`).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can reset passwords.' }, { status: 403 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not verify admin role.' }, { status: 500 });
  }

  // 3. Validate input.
  const body = await req.json().catch(() => ({}));
  const uid = typeof body?.uid === 'string' ? body.uid : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (!uid) {
    return NextResponse.json({ error: 'Target user id is required.' }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'New password must be at least 6 characters.' }, { status: 400 });
  }

  // 4. Set the password.
  try {
    await adminAuth().updateUser(uid, { password: newPassword });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    const code = err?.errorInfo?.code || err?.code || '';
    const message =
      code === 'auth/user-not-found'
        ? 'That user no longer exists in Authentication.'
        : err?.message || 'Failed to update password.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
