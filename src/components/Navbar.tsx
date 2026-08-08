'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/config/constants';
import {
  Flame,
  Users,
  BarChart3,
  FileText,
  Star,
  LayoutDashboard,
  Settings,
  Menu,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useState, useSyncExternalStore } from 'react';

const iconMap = {
  Flame,
  Users,
  BarChart3,
  FileText,
  Star,
  LayoutDashboard,
  Settings,
};

// 用 useSyncExternalStore 判断“是否已在客户端挂载”，避免在 effect 内 setState 触发 eslint 报错。
// 这样服务端渲染时返回 false，客户端 hydrate 首次也会用服务端快照（false），随后再变为 true，避免 hydration mismatch。
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        {/* Logo */}
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Flame className="h-6 w-6 text-orange-500" />
          <span className="font-bold">公众号热榜</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          {NAV_ITEMS.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap];
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center space-x-1 transition-colors hover:text-foreground/80',
                  isActive ? 'text-foreground' : 'text-foreground/60'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile Nav */}
        <div className="flex flex-1 items-center justify-end md:hidden">
          {mounted && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[240px]">
                <nav className="flex flex-col space-y-4 mt-8">
                  {NAV_ITEMS.map((item) => {
                    const Icon = iconMap[item.icon as keyof typeof iconMap];
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center space-x-2 py-2 transition-colors',
                          isActive ? 'text-foreground' : 'text-foreground/60'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </header>
  );
}
