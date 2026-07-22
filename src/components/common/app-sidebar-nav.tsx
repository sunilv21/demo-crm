'use client';
import {
  Book,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Map,
  Users,
  LogOut,
  User,
  MoreHorizontal,
  Activity,
  Database,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Wallet,
  UserCog,
  ChevronRight,
  IndianRupee,
  Building2,
  Sun,
  Moon,
  Monitor,
  Landmark,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  ReceiptText,
  BarChart3,
  Settings,
  Truck,
  Trophy,
  Mail,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth, useUser, useAppUser, type Role } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useNotifications } from '@/components/notifications/notification-provider';
import { NotificationDot } from '@/components/notifications/notification-dot';

// General CRM/management nav — everyone EXCEPT the finance role, which is scoped
// to the Finance module only (see FINANCE_ROLES + the finance redirect guard).
const ALL_ROLES: Role[] = ['admin', 'manager', 'employee', 'agent'];
const ADMIN_MANAGER: Role[] = ['admin', 'manager'];
const ADMIN_ONLY: Role[] = ['admin'];
// Revenue/pricing-margin details are private to agents only (see canViewRevenue).
const AGENT_ONLY: Role[] = ['agent'];
const EMAIL_ROLES: Role[] = ['admin', 'manager', 'agent'];
// Company cash-flow (Finance module) + agent performance — the dedicated
// finance role ONLY (intentionally not shown to admin).
const FINANCE_ROLES: Role[] = ['finance'];

type NavItem = { href: string; icon: any; label: string; allow: Role[] };

const topNavItems: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', allow: ALL_ROLES },
  { href: '/clients', icon: Users, label: 'Clients', allow: ALL_ROLES },
  { href: '/organizations', icon: Building2, label: 'Organizations', allow: ALL_ROLES },
  { href: '/leads', icon: Lightbulb, label: 'Leads', allow: ALL_ROLES },
  { href: '/bookings', icon: Book, label: 'Bookings', allow: ALL_ROLES },
  { href: '/revenue', icon: IndianRupee, label: 'Revenue', allow: AGENT_ONLY },
  { href: '/invoices', icon: FileText, label: 'Invoices', allow: ADMIN_MANAGER },
  { href: '/itinerary-builder', icon: Map, label: 'Itinerary Builder', allow: ALL_ROLES },
  { href: '/activity', icon: Activity, label: 'Activity', allow: ALL_ROLES },
  { href: '/inbox', icon: Mail, label: 'Inbox', allow: EMAIL_ROLES },
  { href: '/database', icon: Database, label: 'Database', allow: ALL_ROLES },
];

const employeeMgmtItems: NavItem[] = [
  { href: '/attendance', icon: CalendarCheck, label: 'Attendance', allow: ALL_ROLES },
  { href: '/leaves', icon: CalendarOff, label: 'Leaves', allow: ALL_ROLES },
  { href: '/holidays', icon: CalendarDays, label: 'Holidays', allow: ALL_ROLES },
  { href: '/payroll', icon: Wallet, label: 'Payroll', allow: ADMIN_ONLY },
  { href: '/users', icon: Users, label: 'Users', allow: ADMIN_ONLY },
  { href: '/settings', icon: Settings, label: 'Settings', allow: ADMIN_ONLY },
];

const financeItems: NavItem[] = [
  { href: '/finance', icon: LayoutDashboard, label: 'Dashboard', allow: FINANCE_ROLES },
  { href: '/finance/money-in', icon: ArrowDownCircle, label: 'Money In', allow: FINANCE_ROLES },
  { href: '/finance/money-out', icon: ArrowUpCircle, label: 'Money Out', allow: FINANCE_ROLES },
  { href: '/finance/transfers', icon: ArrowLeftRight, label: 'Transfers', allow: FINANCE_ROLES },
  { href: '/finance/accounts', icon: Wallet, label: 'Accounts', allow: FINANCE_ROLES },
  { href: '/finance/transactions', icon: ReceiptText, label: 'Transactions', allow: FINANCE_ROLES },
  { href: '/finance/suppliers', icon: Truck, label: 'Suppliers', allow: FINANCE_ROLES },
  { href: '/agent-performance', icon: Trophy, label: 'Agent Performance', allow: FINANCE_ROLES },
  { href: '/finance/reports', icon: BarChart3, label: 'Reports', allow: FINANCE_ROLES },
  { href: '/finance/settings', icon: Settings, label: 'Settings', allow: FINANCE_ROLES },
];

export function AppSidebarNav({ isMobile = false }: { isMobile?: boolean }) {
  const pathname = usePathname();
  const { user } = useUser();
  const { role, isLoading: isRoleLoading } = useAppUser();
  const auth = useAuth();
  const { theme, setTheme } = useTheme();
  const { unseenInbox, unseenCampaigns, unseenMailboxAlerts } = useNotifications();

  const visibleTop = isRoleLoading ? [] : topNavItems.filter((i) => i.allow.includes(role));
  const visibleEmpMgmt = isRoleLoading
    ? []
    : employeeMgmtItems.filter((i) => i.allow.includes(role));

  const isInEmpMgmt = visibleEmpMgmt.some((i) => pathname.startsWith(i.href));
  const [empMgmtOpen, setEmpMgmtOpen] = useState(isInEmpMgmt);

  useEffect(() => {
    if (isInEmpMgmt) setEmpMgmtOpen(true);
  }, [isInEmpMgmt]);

  const visibleFinance = isRoleLoading ? [] : financeItems.filter((i) => i.allow.includes(role));
  const isInFinance = pathname === '/finance' || pathname.startsWith('/finance/') || pathname.startsWith('/agent-performance');
  const [financeOpen, setFinanceOpen] = useState(isInFinance);

  useEffect(() => {
    if (isInFinance) setFinanceOpen(true);
  }, [isInFinance]);

  const handleSignOut = async () => {
    if (!auth) return;
    await signOut(auth);
    // Full document load instead of router.push('/login').
    //
    // This menu item lives inside Radix modal overlays — the dropdown, and on
    // mobile a Sheet as well. While open they set `pointer-events: none` on
    // <body> and only restore it on a clean close. A client-side route change
    // unmounts the whole (app) layout underneath them, so that cleanup never
    // runs and the style sticks: the login form can't be tapped until the user
    // manually refreshes. A fresh document also tears down any Firestore
    // listeners still attached to the now signed-out session, which would
    // otherwise fire permission-denied errors on the way out.
    window.location.assign('/login');
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || 'No email';

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex items-center px-4 h-14 border-b',
          isMobile ? 'justify-start' : 'justify-center'
        )}
      >
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Image src="/favicon.ico" alt="Sky Visa Logo" width={32} height={32} className="h-8 w-auto" />
        </Link>
      </div>
      <div className="flex-1 py-2 overflow-y-auto">
        <SidebarMenu>
          {visibleTop.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.href)}
                  tooltip={item.label}
                >
                  <span className="relative inline-flex">
                    <item.icon />
                    {item.href === '/inbox' && (unseenInbox || unseenCampaigns || unseenMailboxAlerts) && (
                      <NotificationDot className="absolute -right-1 -top-1" />
                    )}
                  </span>
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}

          {visibleEmpMgmt.length > 0 && (
            <Collapsible open={empMgmtOpen} onOpenChange={setEmpMgmtOpen} asChild>
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    isActive={isInEmpMgmt}
                    tooltip="Employee Management"
                    className="w-full"
                  >
                    <UserCog />
                    <span>Employee Management</span>
                    <ChevronRight
                      className={cn(
                        'ml-auto h-4 w-4 transition-transform duration-200',
                        empMgmtOpen && 'rotate-90'
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {visibleEmpMgmt.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname.startsWith(item.href)}
                        >
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )}

          {visibleFinance.length > 0 && (
            <Collapsible open={financeOpen} onOpenChange={setFinanceOpen} asChild>
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton isActive={isInFinance} tooltip="Finance" className="w-full">
                    <Landmark />
                    <span>Finance</span>
                    <ChevronRight
                      className={cn(
                        'ml-auto h-4 w-4 transition-transform duration-200',
                        financeOpen && 'rotate-90'
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {visibleFinance.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={item.href === '/finance' ? pathname === '/finance' : pathname.startsWith(item.href)}
                        >
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )}
        </SidebarMenu>
      </div>
       <div className="mt-auto border-t p-2">
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start items-center gap-2 text-left h-auto p-2">
                     <Avatar className="h-8 w-8">
                        <AvatarFallback>
                            <User className="h-4 w-4 text-muted-foreground" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col flex-1 text-sm truncate">
                        <span className="font-medium">{displayName}</span>
                        <span className="text-muted-foreground truncate">{displayEmail}</span>
                    </div>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 mb-2" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{displayName}</p>
                <p className="text-xs leading-none text-muted-foreground">{displayEmail}</p>
                </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="mr-2 h-4 w-4" />
              <span>Light</span>
              {theme === 'light' && <span className="ml-auto text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="mr-2 h-4 w-4" />
              <span>Dark</span>
              {theme === 'dark' && <span className="ml-auto text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="mr-2 h-4 w-4" />
              <span>System</span>
              {theme === 'system' && <span className="ml-auto text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
            </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
       </div>
    </div>
  );
}
