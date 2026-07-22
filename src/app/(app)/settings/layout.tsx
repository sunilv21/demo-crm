import { RequireRole } from '@/components/common/require-role';

// Admin-only. Email Accounts is the first tab; future integrations (SMS,
// payment gateway, etc.) get added as sibling tabs in settings/page.tsx.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={['admin']} redirectTo="/dashboard">
      {children}
    </RequireRole>
  );
}
