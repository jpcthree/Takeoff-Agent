'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Home, Settings, LogOut } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/components/providers/AuthProvider';

const toolLinks = [
  { href: '/takeoff', label: 'Takeoff Estimator', icon: FileText },
  { href: '/retrofit', label: 'Retrofit Estimator', icon: Home },
];

const managementLinks = [
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col bg-[#1a2332] text-white shrink-0">
        {/* Logo */}
        <div className="flex items-center px-5 py-5">
          <Logo variant="full" theme="light" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2">
          {/* Tools */}
          <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Tools
          </p>
          <div className="space-y-0.5">
            {toolLinks.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white',
                  ].join(' ')}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Divider */}
          <div className="my-3 border-t border-white/10" />

          {/* Management */}
          <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Management
          </p>
          <div className="space-y-0.5">
            {managementLinks.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white',
                  ].join(' ')}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="border-t border-white/10 px-3 py-4">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
              {user?.email?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.user_metadata?.full_name ?? user?.email ?? 'User'}
              </p>
            </div>
            <button
              onClick={signOut}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
    </div>
  );
}
