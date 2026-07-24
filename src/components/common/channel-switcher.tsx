import Link from 'next/link';
import { Mail, MessageCircle, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

type Channel = {
  id: 'email' | 'whatsapp' | 'sms';
  label: string;
  icon: typeof Mail;
  href: string;
  disabled?: boolean;
};

const CHANNELS: Channel[] = [
  { id: 'email', label: 'Email', icon: Mail, href: '/inbox' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, href: '/whatsapp' },
  { id: 'sms', label: 'SMS', icon: Smartphone, href: '#', disabled: true },
];

/**
 * Centered communication-channel switcher — sits above a channel's own
 * sub-navigation (e.g. Email's Inbox/Sent/Campaigns tabs). Email and
 * WhatsApp are live; SMS renders as a visible-but-disabled placeholder for
 * when that channel is added, so the page reads as "Communications" rather
 * than a single-channel inbox.
 */
export function ChannelSwitcher({ active }: { active: Channel['id'] }) {
  return (
    <div className="flex flex-col items-center gap-1 mb-6">
      <div className="inline-flex items-center gap-1 rounded-full border bg-muted/40 p-1">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          const isActive = c.id === active;
          const className = cn(
            'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            isActive
              ? 'bg-background text-foreground shadow-sm'
              : c.disabled
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'text-muted-foreground hover:text-foreground'
          );
          const content = (
            <>
              <Icon className="h-4 w-4" />
              {c.label}
              {c.disabled && (
                <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground/70">
                  Soon
                </span>
              )}
            </>
          );
          if (c.disabled) {
            return (
              <span key={c.id} title={`${c.label} — coming soon`} className={className}>
                {content}
              </span>
            );
          }
          return (
            <Link key={c.id} href={c.href} title={c.label} className={className}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
