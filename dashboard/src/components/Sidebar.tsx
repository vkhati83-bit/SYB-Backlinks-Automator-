'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import SendQueueStatus from './SendQueueStatus';

const navItems = [
  { href: '/', icon: 'home', label: 'Dashboard' },
  { href: '/wip', icon: 'activity', label: 'Today / WIP' },
  { href: '/prospects', icon: 'users', label: 'All Prospects' },
  { href: '/research', icon: 'research', label: 'Research Citations' },
  { href: '/broken-links', icon: 'link', label: 'Broken Links' },
  { href: '/trash', icon: 'trash', label: 'Trash', badge: 'trashCount' },
  { href: '/campaigns', icon: 'folder', label: 'Campaigns' },
  { href: '/responses', icon: 'mail', label: 'Responses' },
  { href: '/sent', icon: 'send', label: 'Sent' },
  { href: '/metrics', icon: 'chart', label: 'Metrics' },
  { href: '/settings', icon: 'settings', label: 'Settings' },
];

const icons: Record<string, JSX.Element> = {
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  activity: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  research: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  link: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  folder: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  mail: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  chart: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  trash: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  send: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),
};

export default function Sidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [safetyMode, setSafetyMode] = useState<string>('test');
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    setMounted(true);

    // Fetch trash count and safety mode
    // Fetch current user
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.user?.email) setUserEmail(data.user.email); })
      .catch(() => {});

    const fetchSidebarData = async () => {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
        const [statsRes, settingsRes] = await Promise.all([
          fetch(`${API_BASE}/prospects/stats`),
          fetch(`${API_BASE}/settings`),
        ]);
        if (statsRes.ok) {
          const data = await statsRes.json();
          setTrashCount(data.trash || 0);
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSafetyMode(data.settings?.safety_mode || 'test');
        }
      } catch (error) {
        console.error('Failed to fetch sidebar data:', error);
      }
    };

    fetchSidebarData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchSidebarData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <aside className="w-64 bg-gray-900 min-h-screen fixed left-0 top-0">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white">SYB Backlinks</h1>
          <p className="text-gray-400 text-sm">Automation Dashboard</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-gray-900 min-h-screen fixed left-0 top-0">
      <div className="p-6">
        <h1 className="text-xl font-bold text-white">SYB Backlinks</h1>
        <p className="text-gray-400 text-sm">Automation Dashboard</p>
      </div>
      <nav className="mt-6">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname?.startsWith(item.href));

          const badgeCount = item.badge === 'trashCount' ? trashCount : null;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-3 transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white border-r-2 border-primary-500'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {icons[item.icon]}
              <span className="flex-1">{item.label}</span>
              {badgeCount !== null && badgeCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="absolute bottom-0 left-0 right-0">
        <SendQueueStatus />
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              safetyMode === 'live' ? 'bg-red-500' : 'bg-green-500'
            }`}></div>
            <span className={`text-sm ${
              safetyMode === 'live' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {safetyMode === 'live' ? 'LIVE MODE' : 'Test Mode'}
            </span>
          </div>
        </div>
        {userEmail && (
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 truncate">{userEmail}</span>
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
