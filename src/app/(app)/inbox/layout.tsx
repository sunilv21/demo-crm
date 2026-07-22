import { RequireRole } from '@/components/common/require-role';

// Daily-use Inbox for the roles that talk to clients. Mailbox credentials
// (the Accounts tab's actual content) stay admin-gated inside the page
// itself — see inbox/page.tsx — even though the route is open to more roles.
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={['admin', 'manager', 'agent']} redirectTo="/dashboard">
      {children}
    </RequireRole>
  );
}
