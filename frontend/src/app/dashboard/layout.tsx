'use client';
import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background dark:bg-background-dark">
      <Header onMenuToggle={() => setMobileOpen(v => !v)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <main className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
