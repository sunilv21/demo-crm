import { RequireRole } from '@/components/common/require-role';

// Company cash-flow module — the dedicated finance role only (not admin).
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={['finance']} redirectTo="/dashboard">
      {children}
    </RequireRole>
  );
}
