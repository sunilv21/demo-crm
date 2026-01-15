'use client';
import {
  Book,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Map,
  Users,
  History,
  LogOut,
  User,
  MoreHorizontal,
  Activity,
  Bell,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
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
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/clients', icon: Users, label: 'Clients' },
  { href: '/leads', icon: Lightbulb, label: 'Leads' },
  { href: '/bookings', icon: Book, label: 'Bookings' },
  { href: '/invoices', icon: FileText, label: 'Invoices' },
  { href: '/itinerary-builder', icon: Map, label: 'Itinerary Builder' },
  { href: '/activity', icon: Activity, label: 'Activity' },
];

export function AppSidebarNav({ isMobile = false }: { isMobile?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const auth = useAuth();

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
          {navItems.map((item) => (
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
