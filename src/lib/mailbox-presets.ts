// Pure data, no server-only imports (nodemailer/imapflow) — safe to import
// from client components like mailbox-form.tsx. mail-transport.ts (server
// only) re-exports this same object for the API routes.

import type { MailboxProvider } from '@/lib/types';

export interface ProviderPreset {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

export const PROVIDER_PRESETS: Record<Exclude<MailboxProvider, 'custom'>, ProviderPreset> = {
  gmail: {
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  outlook: {
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false, // STARTTLS on 587, not implicit TLS
  },
};
