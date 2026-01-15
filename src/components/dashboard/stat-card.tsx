import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  icon?: LucideIcon;
  description?: string;
  isLoading?: boolean;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

export function StatCard({ title, value, icon: Icon, description, isLoading, variant = 'default' }: StatCardProps) {
  const variantClasses = {
    default: '',
    success: 'bg-green-50 border-green-200 text-green-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  };
  
  const iconClasses = {
    default: 'text-muted-foreground',
    success: 'text-green-600',
    danger: 'text-red-600',
    warning: 'text-yellow-600',
  }

  return (
    <Card className={cn("flex flex-col", variantClasses[variant])}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className={cn("h-4 w-4", iconClasses[variant])} />}
      </CardHeader>
      <CardContent className="flex flex-col flex-1 justify-between">
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-24 mb-2 bg-slate-200" />
            <Skeleton className="h-3 w-32 bg-slate-200" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {description && <p className="text-xs text-muted-foreground mt-auto pt-2">{description}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
