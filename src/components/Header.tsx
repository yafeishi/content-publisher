'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Search, User } from 'lucide-react';

interface LogItem {
  id: string;
  action: string;
  result: string;
  createdAt: string;
}

export default function Header() {
  const [openNotifications, setOpenNotifications] = useState(false);
  const [notifications, setNotifications] = useState<LogItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpenNotifications(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const fetchNotifications = async () => {
    if (loadingNotifications) return;
    setLoadingNotifications(true);
    try {
      const res = await fetch('/api/analytics');
      if (!res.ok) return;
      const data = await res.json();
      const logs = Array.isArray(data?.recentLogs) ? data.recentLogs : [];
      setNotifications(logs.slice(0, 8));
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleBellClick = () => {
    const nextOpen = !openNotifications;
    setOpenNotifications(nextOpen);
    if (nextOpen && notifications.length === 0) {
      fetchNotifications();
    }
  };

  return (
    <header className="theme-panel relative z-40 mx-4 mb-0 mt-4 flex h-16 items-center justify-between px-5 md:px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md flex-1">
          <Search className="theme-muted absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索内容、项目或素材..."
            className="theme-input w-full rounded-xl py-2.5 pl-10 pr-4 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative" ref={containerRef}>
          <button
            onClick={handleBellClick}
            className="theme-muted relative rounded-xl p-2 hover:bg-slate-100/80 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="通知"
            title="通知"
          >
            <Bell className="h-5 w-5" />
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: 'var(--danger)' }}></span>
            )}
          </button>
          {openNotifications && (
            <div
              className="modern-popover absolute right-0 top-11 z-[120] w-[22rem] overflow-hidden"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between border-b px-3.5 py-2.5" style={{ borderColor: 'var(--border)' }}>
                <p className="theme-title text-sm font-semibold">通知</p>
                <Link href="/analytics" className="text-xs text-blue-600 hover:underline" onClick={() => setOpenNotifications(false)}>
                  查看全部
                </Link>
              </div>
              <div className="max-h-80 overflow-y-auto p-2.5">
                {loadingNotifications ? (
                  <p className="theme-muted px-2 py-6 text-center text-sm">加载中...</p>
                ) : notifications.length > 0 ? (
                  notifications.map((item) => (
                    <div key={item.id} className="rounded-xl px-2.5 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80">
                      <p className="theme-title text-sm">{item.action}</p>
                      <p className="theme-muted mt-0.5 line-clamp-2 text-xs">{item.result}</p>
                      <p className="theme-muted mt-1 text-[10px]">
                        {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="theme-muted px-2 py-6 text-center text-sm">暂无通知</p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 border-l pl-4" style={{ borderColor: 'var(--border)' }}>
          <div className="text-right">
            <p className="theme-title text-sm font-medium">用户</p>
            <p className="theme-muted text-xs">创作者</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600">
            <User className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    </header>
  );
}
