'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ALL = '__all__';

export function MonthSelect({
  value,
  onChange,
  count = 24,
  className = 'w-[170px]',
  placeholder = 'All months',
}: {
  value: string;
  onChange: (v: string) => void;
  count?: number;
  className?: string;
  placeholder?: string;
}) {
  const options = useMemo(() => {
    const now = new Date();
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { value: v, label: format(d, 'MMMM yyyy') };
    });
  }, [count]);

  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={ALL}>All months</SelectItem>
        {options.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
