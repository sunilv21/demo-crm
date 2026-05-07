import { RequireRole } from '@/components/common/require-role';

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole allow={['admin']}>{children}</RequireRole>;
}
