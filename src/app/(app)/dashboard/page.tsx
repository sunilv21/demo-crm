'use client';
import { PageHeader } from '@/components/common/page-header';
import { OverviewChart } from '@/components/dashboard/overview-chart';
import { RecentBookings } from '@/components/dashboard/recent-bookings';
import { StatCard } from '@/components/dashboard/stat-card';
import { PendingFollowUps } from '@/components/dashboard/pending-follow-ups';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { TeamClientLoad } from '@/components/dashboard/team-client-load';
import { useAppUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import type { Booking, Lead, Client } from '@/lib/types';
import { bookingMadeDate } from '@/lib/booking-details';
import { packageAwareProfit } from '@/lib/booking-package';
import { IndianRupee, Users, CreditCard, UserCheck, CheckCircle, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type MonthlyData = {
  name: string;
  total: number;
};

export default function DashboardPage() {
  const firestore = useFirestore();
  const { isAdminOrManager, canViewRevenue, authUser } = useAppUser();
  const [totalRevenue, setTotalRevenue] = useState(0);
    const [lastMonthRevenue, setLastMonthRevenue] = useState(0);
  const [currentMonthRevenue, setCurrentMonthRevenue] = useState(0);
  // Toggle on the "My Revenue" card: all-time total vs. the current month only.
  const [revenueView, setRevenueView] = useState<'total' | 'month'>('total');
  const [totalProfit, setTotalProfit] = useState(0);
  const [lastMonthProfit, setLastMonthProfit] = useState(0);
  const [currentMonthProfit, setCurrentMonthProfit] = useState(0);
  // Toggle on the "My Profit" card: all-time total vs. the current month only.
  const [profitView, setProfitView] = useState<'total' | 'month'>('total');
  const [chartData, setChartData] = useState<MonthlyData[]>([]);
  const [newClientsThisMonth, setNewClientsThisMonth] = useState(0);
  const [activeClientsPreviousMonth, setActiveClientsPreviousMonth] = useState(0);

  // Non-admins may only read their own clients/bookings (server-enforced).
  const clientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    if (!isAdminOrManager) {
      if (!authUser) return null;
      return query(collection(firestore, 'clients'), where('assignedEmployees', 'array-contains', authUser.uid));
    }
    return collection(firestore, 'clients');
  }, [firestore, isAdminOrManager, authUser]);
  const leadsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'leads') : null, [firestore]);
  const bookingsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    if (!isAdminOrManager) {
      if (!authUser) return null;
      return query(collection(firestore, 'bookings'), where('createdBy', '==', authUser.uid));
    }
    return collection(firestore, 'bookings');
  }, [firestore, isAdminOrManager, authUser]);
  // NOTE: attributing revenue by agentId (not just createdBy) would need a
  // second `where('agentId','==',uid)` query, but Firestore rejects that
  // outright — the bookings read rule only grants access via createdBy,
  // clientAssignedToMe, or admin/finance, and Firestore denies a whole list
  // query unless it can prove every possible match satisfies the rule. Until
  // the security rule also allows `resource.data.agentId == request.auth.uid`,
  // this stays scoped to createdBy like before.
  const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);
  const { data: leads, isLoading: isLoadingLeads } = useCollection<Lead>(leadsQuery);
  const { data: bookings, isLoading: isLoadingBookings } = useCollection<Booking>(bookingsQuery);
  const revenueBookings = bookings ?? [];

  useEffect(() => {
    if (bookings) {
      const now = new Date();
      const thisMonth = now.getMonth();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const thisYear = now.getFullYear();
      const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

      // Revenue is private to each agent — scope it to the bookings credited to them.
      const ownBookings = canViewRevenue && authUser ? revenueBookings : bookings;

      const confirmedBookings = ownBookings.filter(b => b.status === 'confirmed');
      const revenue = confirmedBookings.reduce((sum, booking) => sum + (booking.total || 0), 0);
      setTotalRevenue(revenue);

      const profit = confirmedBookings.reduce(
        (sum, booking) => sum + packageAwareProfit(booking, ownBookings),
        0
      );
      setTotalProfit(profit);

      // Revenue is attributed to the month the booking was made — bookingMadeDate()
      // prefers bookingDateOverride when a late-entered booking's date was
      // corrected, matching Revenue/Agent Performance's month bucketing.
      const createdDate = bookingMadeDate;
      const bookingProfit = (booking: Booking) => packageAwareProfit(booking, ownBookings);

      const lastMonthRev = confirmedBookings
        .filter(b => {
            const bookingDate = createdDate(b);
            return bookingDate && bookingDate.getMonth() === lastMonth && bookingDate.getFullYear() === lastMonthYear;
        })
        .reduce((sum, booking) => sum + (booking.total || 0), 0);
      setLastMonthRevenue(lastMonthRev);

      const currentMonthRev = confirmedBookings
        .filter(b => {
            const bookingDate = createdDate(b);
            return bookingDate && bookingDate.getMonth() === thisMonth && bookingDate.getFullYear() === thisYear;
        })
        .reduce((sum, booking) => sum + (booking.total || 0), 0);
      setCurrentMonthRevenue(currentMonthRev);

      const lastMonthProf = confirmedBookings
        .filter(b => {
            const bookingDate = createdDate(b);
            return bookingDate && bookingDate.getMonth() === lastMonth && bookingDate.getFullYear() === lastMonthYear;
        })
        .reduce((sum, booking) => sum + bookingProfit(booking), 0);
      setLastMonthProfit(lastMonthProf);

      const currentMonthProf = confirmedBookings
        .filter(b => {
            const bookingDate = createdDate(b);
            return bookingDate && bookingDate.getMonth() === thisMonth && bookingDate.getFullYear() === thisYear;
        })
        .reduce((sum, booking) => sum + bookingProfit(booking), 0);
      setCurrentMonthProfit(currentMonthProf);

      const monthlyRevenue: { [key: string]: number } = {};
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      monthNames.forEach(month => {
        monthlyRevenue[month] = 0;
      });

      confirmedBookings.forEach(booking => {
        const bookingDate = createdDate(booking);
        if (!bookingDate) return;
        const monthName = monthNames[bookingDate.getMonth()];
        monthlyRevenue[monthName] += booking.total || 0;
      });

      const dataForChart = monthNames.map(monthName => ({
        name: monthName,
        total: monthlyRevenue[monthName],
      }));

      setChartData(dataForChart);
    }
  }, [bookings, revenueBookings, canViewRevenue, authUser]);

  useEffect(() => {
    if (clients) {
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();

      const lastMonthDate = new Date(now.setMonth(thisMonth - 1));
      const lastMonth = lastMonthDate.getMonth();
      const lastMonthYear = lastMonthDate.getFullYear();

      const newThisMonth = clients.filter(c => {
        const createdAt = c.createdAt?.toDate();
        return createdAt && createdAt.getMonth() === thisMonth && createdAt.getFullYear() === thisYear;
      }).length;
      setNewClientsThisMonth(newThisMonth);

      const activeLastMonth = clients.filter(c => {
        const createdAt = c.createdAt?.toDate();
        // A proxy for active clients in the previous month.
        return createdAt && createdAt.getMonth() === lastMonth && createdAt.getFullYear() === lastMonthYear && c.status === 'active';
      }).length;
      setActiveClientsPreviousMonth(activeLastMonth);
    }
  }, [clients]);

  const totalClients = clients?.length ?? 0;
  const activeClients = clients?.filter(c => c.status === 'active').length ?? 0;
  const approvedVisaStatuses = ['approved', 'completed', 'travelling'];
  const approvedVisas = clients?.filter(c => c.visaStatus && approvedVisaStatuses.includes(c.visaStatus)).length ?? 0;
  const isLoading = isLoadingClients || isLoadingLeads || isLoadingBookings;

  return (
    <>
      <PageHeader title="Dashboard" description="Welcome to your Sky Visa CRM." />
      <div
        className={`grid gap-4 md:grid-cols-2 ${
          canViewRevenue ? 'lg:grid-cols-5' : 'lg:grid-cols-3'
        }`}
      >
        {canViewRevenue && (
          <StatCard
            title="My Revenue"
            value={`₹${(revenueView === 'total' ? totalRevenue : currentMonthRevenue).toLocaleString()}`}
            icon={IndianRupee}
            isLoading={isLoading}
            variant="warning"
            description={
              revenueView === 'total'
                ? `Last Month: ${lastMonthRevenue.toLocaleString()}`
                : `Total: ${totalRevenue.toLocaleString()}`
            }
            valueClassName="text-lg"
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setRevenueView(v => (v === 'total' ? 'month' : 'total'))}
              >
                {revenueView === 'total' ? 'This Month' : 'Total'}
              </Button>
            }
          />
        )}
        {canViewRevenue && (
          <StatCard
            title="My Profit"
            value={`₹${(profitView === 'total' ? totalProfit : currentMonthProfit).toLocaleString()}`}
            icon={TrendingUp}
            isLoading={isLoading}
            variant="success"
            description={
              profitView === 'total'
                ? `Last Month: ${lastMonthProfit.toLocaleString()}`
                : `Total: ${totalProfit.toLocaleString()}`
            }
            valueClassName="text-lg"
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setProfitView(v => (v === 'total' ? 'month' : 'total'))}
              >
                {profitView === 'total' ? 'This Month' : 'Total'}
              </Button>
            }
          />
        )}
        <StatCard
          title="This Month"
          value={`+${newClientsThisMonth}`}
          icon={Users}
          isLoading={isLoading}
          description={`Total Clients: ${totalClients}`}
          valueClassName="text-lg"
        />
        <StatCard
          title="Active Clients"
          value={`+${activeClients}`}
          icon={UserCheck}
          isLoading={isLoading}
          variant="success"
          description={`Previous Month: ${activeClientsPreviousMonth}`}
          valueClassName="text-lg"
        />
         <StatCard
          title="Visa Approved"
          value={`${approvedVisas}`}
          icon={CheckCircle}
          isLoading={isLoading}
          variant="success"
          description={`Total Visa: ${totalClients}`}
          valueClassName="text-lg"
        />
      </div>
      {canViewRevenue && (
        <div className="grid gap-4 mt-8 md:grid-cols-1 lg:grid-cols-3">
          <OverviewChart data={chartData} isLoading={isLoadingBookings} />
          <RecentBookings />
        </div>
      )}
      {isAdminOrManager && !canViewRevenue && (
        <div className="grid gap-4 mt-8 md:grid-cols-1 lg:grid-cols-3">
          <TeamClientLoad />
          <RecentBookings />
        </div>
      )}
      <div className="grid gap-4 mt-8 md:grid-cols-1 lg:grid-cols-2">
        <PendingFollowUps />
        <RecentActivity />
      </div>
    </>
  );
}
