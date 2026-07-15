'use client';

import { useEffect, useState } from 'react';
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
            <li key={href} className="flex items-center gap-2">
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
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // The drawer is uncontrolled by default, so tapping a nav link navigates but
  // leaves it covering the page. Close it once the new route lands. Desktop is
  // untouched — it renders the breadcrumb and has no Sheet at all.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 flex h-10 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 lg:h-[60px] lg:px-6 print:hidden">
      {isMobile ? (
         <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex flex-col p-0"
            // Also close the moment a link is tapped. This covers re-tapping the
            // page you're already on, where the pathname never changes and the
            // effect above would not fire. Group toggles (e.g. Finance) are
            // <button>s, not links, so they still expand without closing.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setNavOpen(false);
            }}
          >
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
