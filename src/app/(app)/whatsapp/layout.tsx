import { RequireRole } from '@/components/common/require-role';

// Same access shape as /inbox — daily-use for the roles that talk to
// clients. Account pairing (QR codes, disconnect) stays admin-gated inside
// the page itself, even though the route is open to more roles.
export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={['admin', 'manager', 'agent']} redirectTo="/dashboard">
      {children}
    </RequireRole>
  );
}
