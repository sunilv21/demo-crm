'use client';

import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import { AppSidebarNav } from './app-sidebar-nav';
import { Menu } from 'lucide-react';

const Breadcrumb = () => {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex">
      <ol className="flex items-center gap-2 text-sm">
        <li>
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Home
          </Link>
        </li>
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join('/')}`;
          const isLast = index === segments.length - 1;
          return (
            <li key={segment} className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <Link
                href={href}
                className={isLast ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}
                aria-current={isLast ? 'page' : undefined}
              >
                {segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export function AppHeader() {
  const { isMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-40 flex h-10 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 lg:h-[60px] lg:px-6">
      {isMobile ? (
         <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0">
             <AppSidebarNav isMobile={true} />
          </SheetContent>
        </Sheet>
      ) : (
        <Breadcrumb />
      )}
      <div className="flex-1" />
    </header>
  );
}
