'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Image,
  CalendarDays,
  BarChart3,
  Settings,
  PenLine,
} from 'lucide-react';

const sidebarItems = [
  {
    title: '仪表盘',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: '内容管理',
    href: '/content',
    icon: FileText,
  },
  {
    title: '项目管理',
    href: '/projects',
    icon: FolderKanban,
  },
  {
    title: '素材库',
    href: '/assets',
    icon: Image,
  },
  {
    title: '内容日历',
    href: '/calendar',
    icon: CalendarDays,
  },
  {
    title: '数据看板',
    href: '/analytics',
    icon: BarChart3,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="theme-panel m-4 mb-4 mr-0 hidden w-72 flex-col lg:flex">
      <div className="border-b px-6 py-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg">
            <PenLine className="h-5 w-5" />
          </div>
          <div>
            <span className="theme-title block text-lg font-semibold">内容发布</span>
            <span className="theme-muted text-xs">Creator Studio</span>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    isActive
                      ? 'nav-item-active'
                      : ''
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t p-4" style={{ borderColor: 'var(--border)' }}>
        <Link
          href="/settings"
          className="nav-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
        >
          <Settings className="h-5 w-5" />
          设置
        </Link>
      </div>
    </aside>
  );
}
