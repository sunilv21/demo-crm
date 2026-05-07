import { RequireRole } from '@/components/common/require-role';

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole allow={['admin']}>{children}</RequireRole>;
}
