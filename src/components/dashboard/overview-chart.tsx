'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '../ui/skeleton';
import { formatINR, formatINRCompact } from '@/lib/utils';

export type MonthlyRevenue = {
  name: string;
  total: number;
  profit?: number;
};

const chartConfig = {
  total: {
    label: 'Revenue',
    color: 'hsl(var(--chart-1))',
  },
  profit: {
    label: 'Profit',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

export function OverviewChart({
  data,
  isLoading,
  title = 'Revenue Overview',
  description,
  showProfit = false,
  className = 'col-span-1 lg:col-span-2',
}: {
  data: MonthlyRevenue[];
  isLoading: boolean;
  title?: string;
  description?: string;
  showProfit?: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalRevenue = (data ?? []).reduce((s, d) => s + (d.total || 0), 0);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description ?? 'Attributed to the month each booking was created'}</CardDescription>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight">{formatINR(totalRevenue)}</div>
          <p className="text-xs text-muted-foreground">This year</p>
        </div>
      </CardHeader>
      <CardContent className="pl-2">
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.95} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="profitBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.95} />
                <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value) => formatINRCompact(Number(value))}
            />
            <Tooltip
              content={<ChartTooltipContent formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground capitalize">{name}</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">{formatINR(Number(value))}</span>
                </div>
              )} />}
              cursor={{ fill: 'hsl(var(--accent))', opacity: 0.4 }}
            />
            {showProfit && <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
            <Bar dataKey="total" name="Revenue" fill="url(#revenueBar)" radius={[6, 6, 0, 0]} maxBarSize={44} />
            {showProfit && (
              <Bar dataKey="profit" name="Profit" fill="url(#profitBar)" radius={[6, 6, 0, 0]} maxBarSize={44} />
            )}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
