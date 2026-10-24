'use client';

import {
  BarChart3, Building2, CalendarDays, CheckSquare, Columns3, LayoutDashboard, Menu, UserRound, Users, X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav';

const ICONS = {
  overview: LayoutDashboard, leads: UserRound, pipeline: Columns3, properties: Building2,
  visits: CalendarDays, tasks: CheckSquare, reports: BarChart3, team: Users,
};

export function Sidebar({ items, brandName, footer }: { items: NavItem[]; brandName: string; footer: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Workspace" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'bg-white/10 text-ivory' : 'text-stone-300 hover:bg-white/5 hover:text-ivory',
            )}
          >
            <Icon className={cn('h-[18px] w-[18px]', active ? 'text-gold-300' : '')} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-navy-800 bg-navy-950 px-4 py-3 lg:hidden">
        <Logo name={brandName} light />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ivory hover:bg-white/10"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="border-b border-navy-800 bg-navy-950 px-3 pb-4 lg:hidden">
          {nav}
          <div className="mt-4 border-t border-white/10 pt-4">{footer}</div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col bg-navy-950 px-3 py-5 lg:flex">
        <div className="px-3 pb-6"><Logo name={brandName} light /></div>
        {nav}
        <div className="mt-auto border-t border-white/10 pt-4">{footer}</div>
      </aside>
    </>
  );
}
