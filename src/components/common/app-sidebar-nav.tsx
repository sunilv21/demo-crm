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
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth, useUser, useAppUser, type Role } from '@/firebase';
import { signOut } from 'firebase/auth';

const ALL_ROLES: Role[] = ['admin', 'manager', 'employee'];
const ADMIN_MANAGER: Role[] = ['admin', 'manager'];
const ADMIN_ONLY: Role[] = ['admin'];

type NavItem = { href: string; icon: any; label: string; allow: Role[] };

const topNavItems: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', allow: ALL_ROLES },
  { href: '/clients', icon: Users, label: 'Clients', allow: ALL_ROLES },
  { href: '/leads', icon: Lightbulb, label: 'Leads', allow: ALL_ROLES },
  { href: '/bookings', icon: Book, label: 'Bookings', allow: ALL_ROLES },
  { href: '/invoices', icon: FileText, label: 'Invoices', allow: ADMIN_MANAGER },
  { href: '/itinerary-builder', icon: Map, label: 'Itinerary Builder', allow: ALL_ROLES },
  { href: '/activity', icon: Activity, label: 'Activity', allow: ALL_ROLES },
  { href: '/database', icon: Database, label: 'Database', allow: ADMIN_MANAGER },
];

const employeeMgmtItems: NavItem[] = [
  { href: '/attendance', icon: CalendarCheck, label: 'Attendance', allow: ALL_ROLES },
  { href: '/leaves', icon: CalendarOff, label: 'Leaves', allow: ALL_ROLES },
  { href: '/holidays', icon: CalendarDays, label: 'Holidays', allow: ALL_ROLES },
  { href: '/payroll', icon: Wallet, label: 'Payroll', allow: ADMIN_ONLY },
  { href: '/users', icon: Users, label: 'Users', allow: ADMIN_ONLY },
];

export function AppSidebarNav({ isMobile = false }: { isMobile?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { role, isLoading: isRoleLoading } = useAppUser();
  const auth = useAuth();

  const visibleTop = isRoleLoading ? [] : topNavItems.filter((i) => i.allow.includes(role));
  const visibleEmpMgmt = isRoleLoading
    ? []
    : employeeMgmtItems.filter((i) => i.allow.includes(role));

  const isInEmpMgmt = visibleEmpMgmt.some((i) => pathname.startsWith(i.href));
  const [empMgmtOpen, setEmpMgmtOpen] = useState(isInEmpMgmt);

  useEffect(() => {
    if (isInEmpMgmt) setEmpMgmtOpen(true);
  }, [isInEmpMgmt]);

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/login');
    }
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || 'No email';
  const userInitial = displayName.charAt(0).toUpperCase();

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
                  <item.icon />
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
        </SidebarMenu>
      </div>
       <div className="mt-auto border-t p-2">
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start items-center gap-2 text-left h-auto p-2">
                     <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.photoURL || ''} alt={displayName} data-ai-hint="person face" />
                        <AvatarFallback>{userInitial}</AvatarFallback>
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
