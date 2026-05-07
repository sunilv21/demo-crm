import { RequireRole } from '@/components/common/require-role';

export default function DatabaseLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole allow={['admin', 'manager']}>{children}</RequireRole>;
}
