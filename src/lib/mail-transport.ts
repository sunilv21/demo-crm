// Server-only. Builds nodemailer/imapflow clients from a mailbox record, and
// holds the Gmail/Outlook connection presets shared by the mailbox form and
// the API routes.

import nodemailer, { type Transporter } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import type { Mailbox } from '@/lib/types';

export { PROVIDER_PRESETS, type ProviderPreset } from '@/lib/mailbox-presets';

type MailboxCreds = Pick<
  Mailbox,
  'smtpHost' | 'smtpPort' | 'smtpSecure' | 'imapHost' | 'imapPort' | 'imapSecure' | 'username'
>;

export function buildSmtpTransport(mailbox: MailboxCreds, plainPassword: string): Transporter {
  return nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpSecure, // true = implicit TLS (465), false = STARTTLS (587)
    auth: {
      user: mailbox.username,
      pass: plainPassword,
    },
  });
}

export function buildImapClient(mailbox: MailboxCreds, plainPassword: string): ImapFlow {
  return new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapSecure,
    auth: {
      user: mailbox.username,
      pass: plainPassword,
    },
    logger: false,
  });
}
