'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

const NAV_ITEMS = [
  { labelKey: 'nav.serverDashboard', icon: 'dns', href: '/dashboard' },
  { labelKey: 'nav.equipmentDashboard', icon: 'devices', href: '/dashboard/equipment' },
  { labelKey: 'nav.sender', icon: 'upload', href: '/dashboard/sender' },
  { labelKey: 'nav.receiver', icon: 'download', href: '/dashboard/receiver' },
  { labelKey: 'nav.simulator', icon: 'science', href: '/dashboard/simulator' },
  { labelKey: 'nav.targetMapping', icon: 'swap_horiz', href: '/dashboard/mapping' },
  { labelKey: 'nav.logViewer', icon: 'description', href: '/dashboard/logs' },
  { labelKey: 'nav.errors', icon: 'error', href: '/dashboard/errors' },
  { labelKey: 'nav.retry', icon: 'replay', href: '/dashboard/retry' },
  { labelKey: 'nav.logFileSearch', icon: 'folder_open', href: '/dashboard/log-files' },
  { labelKey: 'nav.systemLogs', icon: 'terminal', href: '/dashboard/system-logs' },
  { labelKey: 'nav.download', icon: 'file_download', href: '/dashboard/download' },
  { labelKey: 'nav.settings', icon: 'settings', href: '/dashboard/settings' },
  { labelKey: 'nav.help', icon: 'help', href: '/dashboard/help' },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  const isActive = (href: string) => pathname === href;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <nav className="flex-1 p-4 space-y-1">
        <p className={`text-sm font-bold text-text-secondary uppercase tracking-wider mb-3
          ${collapsed ? 'text-center text-[10px]' : 'px-3'}`}>
          {collapsed ? '•••' : t('nav.menu')}
        </p>
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href} onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
              ${collapsed ? 'justify-center px-0' : ''}
              ${isActive(item.href)
                ? 'bg-primary text-primary-foreground font-bold'
                : 'text-text dark:text-white hover:bg-surface dark:hover:bg-surface-dark'}`}>
            <Icon name={item.icon} size="sm"
              className={isActive(item.href) ? 'text-primary-foreground' : 'text-text dark:text-white'} />
            {!collapsed && <span className="text-base">{t(item.labelKey)}</span>}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border dark:border-border-dark">
        <p className={`text-xs text-muted-foreground ${collapsed ? 'text-center' : ''}`}>
          {collapsed ? 'V' : t('nav.footer')}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`fixed lg:static z-50 lg:z-0 h-full
        bg-background-white dark:bg-background-dark
        border-r border-border dark:border-border-dark
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>

        <button onClick={toggle}
          className="hidden lg:flex absolute -right-3 top-6 z-10 size-6 rounded-full
            bg-primary text-white items-center justify-center shadow-lg
            hover:scale-110 transition-transform">
          <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} size="xs" />
        </button>

        {sidebarContent}
      </aside>
    </>
  );
}
