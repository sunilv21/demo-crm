// Shared client-side fetch wrapper for authenticated API routes. Mirrors the
// Authorization: Bearer <idToken> pattern already used for
// /api/admin/reset-password (see src/app/(app)/users/page.tsx). Used by
// src/lib/mailbox-client.ts and src/lib/campaign-client.ts.

import type { User as FirebaseUser } from 'firebase/auth';

export async function callApi<T>(
  authUser: FirebaseUser,
  path: string,
  options: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown }
): Promise<T> {
  const idToken = await authUser.getIdToken();
  const res = await fetch(path, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Request failed. Please try again.');
  }
  return data as T;
}
