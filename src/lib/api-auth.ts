// Server-only. Shared caller-authentication/authorization check for
// privileged API routes, factored out of
// src/app/api/admin/reset-password/route.ts since the Email module adds
// several more routes needing the identical check.

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { User } from '@/lib/types';

export type AuthResult = { uid: string } | { errorResponse: NextResponse };

/**
 * Verifies the caller's ID token and that their /users/{uid}.role is one of
 * allowedRoles. Use requireAdmin() for the common admin-only case.
 */
export async function requireRole(req: NextRequest, allowedRoles: User['role'][]): Promise<AuthResult> {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!token) {
    return { errorResponse: NextResponse.json({ error: 'Missing authentication token.' }, { status: 401 }) };
  }

  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return {
      errorResponse: NextResponse.json({ error: 'Invalid or expired session. Sign in again.' }, { status: 401 }),
    };
  }

  try {
    const callerSnap = await adminDb().doc(`users/${uid}`).get();
    const role = callerSnap.data()?.role;
    if (!callerSnap.exists || !allowedRoles.includes(role)) {
      return { errorResponse: NextResponse.json({ error: 'You do not have access to this action.' }, { status: 403 }) };
    }
  } catch {
    return { errorResponse: NextResponse.json({ error: 'Could not verify your role.' }, { status: 500 }) };
  }

  return { uid };
}

export function requireAdmin(req: NextRequest): Promise<AuthResult> {
  return requireRole(req, ['admin']);
}
