import { RequireRole } from '@/components/common/require-role';

// Agent performance / revenue oversight — the dedicated finance role only
// (not admin). Part of the Finance profile's remit.
export default function AgentPerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={['finance']} redirectTo="/dashboard">
      {children}
    </RequireRole>
  );
}
