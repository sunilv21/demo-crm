// Thin client-side wrappers around the WhatsApp module's API routes.
// Mirrors src/lib/mailbox-client.ts's Authorization: Bearer <idToken> pattern.

import type { User as FirebaseUser } from 'firebase/auth';
import { callApi } from '@/lib/api-client';

export type CreateWhatsAppAccountInput =
  | { provider: 'whatsapp_web'; label: string; isDefault?: boolean }
  | {
      provider: 'twilio';
      label: string;
      isDefault?: boolean;
      accountSid: string;
      authToken: string;
      whatsappFrom: string;
    }
  | {
      provider: 'meta_cloud';
      label: string;
      isDefault?: boolean;
      phoneNumberId: string;
      wabaId?: string;
      accessToken: string;
    };

export function createWhatsAppAccount(authUser: FirebaseUser, input: CreateWhatsAppAccountInput) {
  return callApi<{ success: true; id: string }>(authUser, '/api/whatsapp/accounts', {
    method: 'POST',
    body: input,
  });
}

export function saveMetaWebhookSettings(authUser: FirebaseUser, input: { appSecret?: string; verifyToken?: string }) {
  return callApi<{ success: true; verifyToken: string }>(authUser, '/api/whatsapp/meta-settings', {
    method: 'POST',
    body: input,
  });
}

export function reconnectWhatsAppAccount(authUser: FirebaseUser, accountId: string) {
  return callApi<{ success: true }>(authUser, `/api/whatsapp/accounts/${accountId}/reconnect`, {
    method: 'POST',
  });
}

export function disconnectWhatsAppAccount(authUser: FirebaseUser, accountId: string) {
  return callApi<{ success: true }>(authUser, `/api/whatsapp/accounts/${accountId}/disconnect`, {
    method: 'POST',
  });
}

export function deleteWhatsAppAccount(authUser: FirebaseUser, accountId: string) {
  return callApi<{ success: true }>(authUser, `/api/whatsapp/accounts/${accountId}`, {
    method: 'DELETE',
  });
}

export function sendWhatsAppMessage(authUser: FirebaseUser, input: { accountId: string; to: string; body: string }) {
  return callApi<{ success: true; chatId?: string }>(authUser, '/api/whatsapp/send', {
    method: 'POST',
    body: input,
  });
}

export function sendWhatsAppVoucher(
  authUser: FirebaseUser,
  input: { accountId: string; to: string; bookingId: string; caption?: string }
) {
  return callApi<{ success: true }>(authUser, '/api/whatsapp/send-voucher', {
    method: 'POST',
    body: input,
  });
}
