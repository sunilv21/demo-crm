// Thin client-side wrapper around the one WhatsApp campaign API route (the
// actual send has to happen server-side — campaign CRUD itself is plain
// Firestore writes, see new-whatsapp-campaign-dialog.tsx /
// whatsapp-campaign-detail-dialog.tsx). Mirrors src/lib/campaign-client.ts.

import type { User as FirebaseUser } from 'firebase/auth';
import { callApi } from '@/lib/api-client';

export function processWhatsAppCampaignNow(authUser: FirebaseUser, campaignId: string) {
  return callApi<{ success: true; processed: number; sent: number; failed: number }>(
    authUser,
    `/api/whatsapp/campaigns/${campaignId}/process`,
    { method: 'POST' }
  );
}
