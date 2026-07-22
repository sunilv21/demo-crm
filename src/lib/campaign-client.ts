// Thin client-side wrapper around the one campaign API route (the actual
// send has to happen server-side to decrypt the mailbox password — campaign
// CRUD itself is plain Firestore writes, see new-campaign-dialog.tsx /
// campaign-detail-dialog.tsx).

import type { User as FirebaseUser } from 'firebase/auth';
import { callApi } from '@/lib/api-client';

export function processCampaignNow(authUser: FirebaseUser, campaignId: string) {
  return callApi<{ success: true; processed: number; sent: number; failed: number }>(
    authUser,
    `/api/email/campaigns/${campaignId}/process`,
    { method: 'POST' }
  );
}
