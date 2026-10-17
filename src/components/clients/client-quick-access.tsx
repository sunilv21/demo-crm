'use client';
import { Book, FileText, FileUp, History, Map, User } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Profile',        icon: User,     slug: '' },
  { label: 'Bookings',       icon: Book,     slug: 'bookings' },
  { label: 'Itinerary',      icon: Map,      slug: 'itinerary' },
  { label: 'Documents',      icon: FileUp,   slug: 'documents' },
  { label: 'Invoices',       icon: FileText, slug: 'invoices' },
  { label: 'Travel History', icon: History,  slug: 'history' },
];

export function ClientQuickAccess() {
  const params = useParams();
  const pathname = usePathname();
  const clientId = params.clientId as string;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client Pages</p>
      </div>
      <nav className="p-1">
        {NAV_ITEMS.map(({ label, icon: Icon, slug }) => {
          const href = `/clients/${clientId}${slug ? `/${slug}` : ''}`;
          const isActive = slug === ''
            ? pathname === `/clients/${clientId}`
            : pathname.startsWith(`/clients/${clientId}/${slug}`);
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
