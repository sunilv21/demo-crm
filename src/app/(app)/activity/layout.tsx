import { RequireRole } from '@/components/common/require-role';

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole allow={['admin', 'manager']}>{children}</RequireRole>;
}
