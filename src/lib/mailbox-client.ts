// Thin client-side wrappers around the Email module's admin API routes.
// Mirrors the Authorization: Bearer <idToken> pattern already used for
// /api/admin/reset-password (see src/app/(app)/users/page.tsx).

import type { User as FirebaseUser } from 'firebase/auth';
import type { MailboxProvider } from '@/lib/types';
import { callApi } from '@/lib/api-client';

export interface SaveMailboxInput {
  mailboxId?: string;
  email: string;
  displayName: string;
  provider: MailboxProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password?: string;
  isDefault: boolean;
  isEnabled: boolean;
}

export function saveMailbox(authUser: FirebaseUser, input: SaveMailboxInput) {
  return callApi<{ success: true; id: string }>(authUser, '/api/settings/mailboxes/save', {
    method: 'POST',
    body: input,
  });
}

export interface TestMailboxInput {
  mailboxId?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  username?: string;
  password?: string;
}

export interface TestMailboxResult {
  imap: { ok: boolean; error?: string };
  smtp: { ok: boolean; error?: string };
}

export function testMailboxConnection(authUser: FirebaseUser, input: TestMailboxInput) {
  return callApi<TestMailboxResult>(authUser, '/api/settings/mailboxes/test', {
    method: 'POST',
    body: input,
  });
}

export function toggleMailboxEnabled(authUser: FirebaseUser, mailboxId: string, isEnabled: boolean) {
  return callApi<{ success: true }>(authUser, `/api/settings/mailboxes/${mailboxId}/toggle`, {
    method: 'POST',
    body: { isEnabled },
  });
}

export function setDefaultMailbox(authUser: FirebaseUser, mailboxId: string) {
  return callApi<{ success: true }>(authUser, `/api/settings/mailboxes/${mailboxId}/set-default`, {
    method: 'POST',
  });
}

export function deleteMailbox(authUser: FirebaseUser, mailboxId: string) {
  return callApi<{ success: true }>(authUser, `/api/settings/mailboxes/${mailboxId}`, {
    method: 'DELETE',
  });
}

export function syncMailboxNow(authUser: FirebaseUser, mailboxId: string) {
  return callApi<{ success: true; newCount: number }>(authUser, `/api/settings/mailboxes/${mailboxId}/sync`, {
    method: 'POST',
  });
}

export interface SendEmailAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

export interface SendEmailInput {
  mailboxId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: SendEmailAttachment[];
  relatedClientId?: string;
  relatedBookingId?: string;
}

export function sendEmail(authUser: FirebaseUser, input: SendEmailInput) {
  return callApi<{ success: true; messageId: string | null }>(authUser, '/api/email/send', {
    method: 'POST',
    body: input,
  });
}
