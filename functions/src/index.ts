import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

interface AdminResetPasswordData {
  uid: string;
  newPassword: string;
}

/**
 * Direct password reset by an admin.
 *
 * Caller must:
 *   - be authenticated
 *   - have role === 'admin' in /users/{caller.uid}
 *
 * Then we use Firebase Admin SDK to set the target user's password directly,
 * no current-password required (only an admin operation can do this).
 */
export const adminResetPassword = onCall<AdminResetPasswordData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  // Verify caller is admin via their /users/{uid} doc.
  const callerSnap = await getFirestore()
    .doc(`users/${request.auth.uid}`)
    .get();

  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can reset passwords.');
  }

  const { uid, newPassword } = request.data ?? ({} as AdminResetPasswordData);
  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'Target uid is required.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError(
      'invalid-argument',
      'New password must be at least 6 characters.',
    );
  }

  try {
    await getAuth().updateUser(uid, { password: newPassword });
  } catch (err: any) {
    throw new HttpsError(
      'internal',
      err?.message || 'Failed to update password.',
    );
  }

  return { success: true };
});
