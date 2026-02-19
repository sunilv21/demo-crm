'use client';
import { PageHeader } from '@/components/common/page-header';
import { OverviewChart } from '@/components/dashboard/overview-chart';
import { RecentBookings } from '@/components/dashboard/recent-bookings';
import { StatCard } from '@/components/dashboard/stat-card';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, getDocs, collectionGroup } from 'firebase/firestore';
import type { Booking, Lead, Client } from '@/lib/types';
import { IndianRupee, Users, Activity, CreditCard, UserCheck, CheckCircle, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

type MonthlyData = {
  name: string;
  total: number;
};

export default function DashboardPage() {
  const firestore = useFirestore();
  const [totalRevenue, setTotalRevenue] = useState(0);
    const [lastMonthRevenue, setLastMonthRevenue] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);
  const [chartData, setChartData] = useState<MonthlyData[]>([]);
  const [newClientsThisMonth, setNewClientsThisMonth] = useState(0);
  const [activeClientsPreviousMonth, setActiveClientsPreviousMonth] = useState(0);
  
  const clientsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'clients') : null, [firestore]);
  const leadsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'leads') : null, [firestore]);
  const bookingsQuery = useMemoFirebase(() => firestore ? query(collectionGroup(firestore, 'bookings')) : null, [firestore]);

  const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);
  const { data: leads, isLoading: isLoadingLeads } = useCollection<Lead>(leadsQuery);
  const { data: bookings, isLoading: isLoadingBookings } = useCollection<Booking>(bookingsQuery);

  useEffect(() => {
    if (bookings) {
      const now = new Date();
      const thisMonth = now.getMonth();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const thisYear = now.getFullYear();
      const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

      const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
      const revenue = confirmedBookings.reduce((sum, booking) => sum + (booking.total || 0), 0);
      setTotalRevenue(revenue);
      
      const lastMonthRev = confirmedBookings
        .filter(b => {
            const bookingDate = new Date(b.startDate);
            return bookingDate.getMonth() === lastMonth && bookingDate.getFullYear() === lastMonthYear;
        })
        .reduce((sum, booking) => sum + (booking.total || 0), 0);
      setLastMonthRevenue(lastMonthRev);

      const monthlyRevenue: { [key: string]: number } = {};
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      
      monthNames.forEach(month => {
        monthlyRevenue[month] = 0;
      });

      confirmedBookings.forEach(booking => {
        const month = new Date(booking.startDate).getMonth();
        const monthName = monthNames[month];
        monthlyRevenue[monthName] += booking.total || 0;
      });

      const dataForChart = monthNames.map(monthName => ({
        name: monthName,
        total: monthlyRevenue[monthName],
      }));
      
      setChartData(dataForChart);
    }
  }, [bookings]);

  useEffect(() => {
    if (leads && leads.length > 0) {
      const wonLeads = leads.filter(lead => lead.status === 'won').length;
      setConversionRate(Math.round((wonLeads / leads.length) * 100));
    }
  }, [leads]);
  
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
  const rejectedVisas = clients?.filter(c => c.visaStatus === 'rejected').length ?? 0;
  const isLoading = isLoadingClients || isLoadingLeads || isLoadingBookings;

  return (
    <>
      <PageHeader title="Dashboard" description="Welcome to your Sky Visa CRM." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Revenue"
          value={`₹${(totalRevenue).toLocaleString()}`}
          icon={IndianRupee}
          isLoading={isLoading}
          variant="warning"
          description={`Last Month: ${lastMonthRevenue.toLocaleString()}`}
        />
        <StatCard
          title="This Month"
          value={`+${newClientsThisMonth}`}
          icon={Users}
          isLoading={isLoading}
          description={`Total Clients: ${totalClients}`}
        />
        <StatCard
          title="Active Clients"
          value={`+${activeClients}`}
          icon={UserCheck}
          isLoading={isLoading}
          variant="success"
          description={`Previous Month: ${activeClientsPreviousMonth}`}
        />
        <StatCard
          title="Conversion Rate"
          value={`${conversionRate}%`}
          icon={Activity}
          isLoading={isLoading}
        />
         <StatCard
          title="Visa Approved"
          value={`${approvedVisas}`}
          icon={CheckCircle}
          isLoading={isLoading}
          variant="success"
          description={`Total Visa: ${totalClients}`}
        />
         <StatCard
          title="Visa Rejected"
          value={`${rejectedVisas}`}
          icon={XCircle}
          isLoading={isLoading}
          variant="danger"
          description={`Total rejected: ${rejectedVisas}`}
        />
      </div>
      <div className="grid gap-4 mt-8 md:grid-cols-1 lg:grid-cols-3">
        <OverviewChart data={chartData} isLoading={isLoadingBookings} />
        <RecentBookings />
      </div>
    </>
  );
}
