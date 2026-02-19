# Next.js Frontend Separation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `public/monitor.html` 단일 파일을 `frontend/` Next.js 멀티 페이지 앱으로 분리하여 유지보수성과 확장성을 확보한다.

**Architecture:** Next.js 15 App Router 기반 멀티 페이지 구조. Fastify 백엔드(3100)로 API 프록시. DESIGN_GUIDELINE.md의 oklch() 색상 시스템 + Tailwind CSS 4 적용.

**Tech Stack:** Next.js 15, Tailwind CSS 4, TypeScript, Material Symbols Outlined, Outfit/Inter fonts

---

## Task 1: Next.js 프로젝트 스캐폴딩

**Files:**
- Create: `frontend/` (전체 디렉토리)

**Step 1: create-next-app으로 프로젝트 생성**

```bash
cd /c/Project/vector
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-turbopack --import-alias "@/*"
```

프롬프트 응답:
- Would you like to use Turbopack? → No

**Step 2: 불필요한 기본 파일 정리**

`frontend/src/app/page.tsx`의 기본 내용 삭제 (이후 Task에서 재작성).
`frontend/public/` 안의 기본 SVG 파일 삭제.

**Step 3: 설치 확인**

```bash
cd /c/Project/vector/frontend && npm run dev
```
Expected: `http://localhost:3000` 접속 가능

**Step 4: 개발 서버 중지 후 커밋**

```bash
git add frontend/
git commit -m "feat: scaffold Next.js frontend project"
```

---

## Task 2: Tailwind CSS 4 + globals.css (oklch 색상 시스템)

**Files:**
- Modify: `frontend/src/app/globals.css`

**Step 1: globals.css를 DESIGN_GUIDELINE oklch 색상 체계로 교체**

```css
@import "tailwindcss";

/* ═══ Tailwind 커스텀 variant ═══ */
@custom-variant dark (&:where(.dark, .dark *));

/* ═══ Google Fonts ═══ */
@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap");

/* ═══ Light Theme (default) ═══ */
:root {
  --font-sans: "Outfit", "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Fira Code", ui-monospace, monospace;

  --background: oklch(0.98 0.002 248);
  --foreground: oklch(0.16 0.035 282);
  --card: oklch(1.0 0 0);
  --card-foreground: oklch(0.16 0.035 282);
  --primary: oklch(0.67 0.290 341);
  --primary-foreground: oklch(1.0 0 0);
  --secondary: oklch(0.96 0.020 286);
  --secondary-foreground: oklch(0.16 0.035 282);
  --accent: oklch(0.89 0.174 171);
  --accent-foreground: oklch(0.16 0.035 282);
  --destructive: oklch(0.65 0.235 34);
  --destructive-foreground: oklch(1.0 0 0);
  --muted: oklch(0.96 0.020 286);
  --muted-foreground: oklch(0.55 0.020 286);
  --border: oklch(0.92 0.009 225);
  --input: oklch(0.92 0.009 225);
  --ring: oklch(0.67 0.290 341);

  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;

  --surface: oklch(0.96 0.005 248);
  --surface-dark: oklch(0.21 0.052 281);
  --background-white: oklch(1.0 0 0);
  --background-dark: oklch(0.14 0.030 282);
  --border-dark: oklch(0.33 0.083 281);
  --border-hover: oklch(0.85 0.015 248);
  --primary-hover: oklch(0.60 0.290 341);
  --card-hover: oklch(0.97 0.005 248);
  --text: oklch(0.16 0.035 282);
  --text-secondary: oklch(0.55 0.020 286);

  --sidebar: oklch(0.98 0.002 248);
  --sidebar-foreground: oklch(0.16 0.035 282);
  --sidebar-primary: oklch(0.67 0.290 341);
  --sidebar-accent: oklch(0.89 0.174 171);
  --sidebar-border: oklch(0.92 0.009 225);

  --chart-1: oklch(0.67 0.290 341);
  --chart-2: oklch(0.60 0.200 300);
  --chart-3: oklch(0.70 0.150 230);
  --chart-4: oklch(0.80 0.150 175);
  --chart-5: oklch(0.80 0.150 90);

  --radius: 0.5rem;
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);

  --shadow-2xs: 0 1px 2px 0 rgb(0 0 0 / 0.03);
  --shadow-xs: 0 1px 3px 0 rgb(0 0 0 / 0.04);
  --shadow-sm: 0 2px 6px 0 rgb(0 0 0 / 0.06);
  --shadow: 0 4px 12px 0 rgb(0 0 0 / 0.08);
  --shadow-md: 0 6px 16px 0 rgb(0 0 0 / 0.1);
  --shadow-lg: 0 12px 28px 0 rgb(0 0 0 / 0.12);
  --shadow-xl: 0 20px 40px 0 rgb(0 0 0 / 0.16);
  --shadow-2xl: 0 28px 56px 0 rgb(0 0 0 / 0.2);

  color-scheme: light;
}

/* ═══ Dark Theme ═══ */
.dark {
  --background: oklch(0.16 0.035 282);
  --foreground: oklch(0.95 0.007 261);
  --card: oklch(0.25 0.061 281);
  --card-foreground: oklch(0.95 0.007 261);
  --secondary: oklch(0.25 0.061 281);
  --secondary-foreground: oklch(0.95 0.007 261);
  --muted: oklch(0.21 0.052 281);
  --muted-foreground: oklch(0.62 0.050 278);
  --border: oklch(0.33 0.083 281);
  --input: oklch(0.33 0.083 281);

  --surface: oklch(0.21 0.052 281);
  --card-hover: oklch(0.28 0.065 281);
  --border-hover: oklch(0.40 0.080 281);
  --text: oklch(0.95 0.007 261);
  --text-secondary: oklch(0.62 0.050 278);

  --sidebar: oklch(0.16 0.035 282);
  --sidebar-foreground: oklch(0.95 0.007 261);
  --sidebar-border: oklch(0.33 0.083 281);

  color-scheme: dark;
}

/* ═══ Base styles ═══ */
body {
  font-family: var(--font-sans);
  background: var(--background);
  color: var(--foreground);
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* ═══ Material Symbols ═══ */
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
}
.material-symbols-outlined.filled {
  font-variation-settings: "FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24;
}

/* ═══ Scrollbar ═══ */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--background); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }

/* ═══ Animations ═══ */
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes pulseGlow { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

@theme {
  --animate-fade-in: fadeIn 0.3s ease-out both;
  --animate-slide-in-right: slideInRight 0.3s ease-out both;
  --animate-pulse-glow: pulseGlow 2s ease-in-out infinite;
}
```

**Step 2: 빌드 확인**

```bash
cd /c/Project/vector/frontend && npm run build
```
Expected: 빌드 성공

**Step 3: 커밋**

```bash
git add frontend/src/app/globals.css
git commit -m "feat: add oklch color system and Tailwind CSS 4 theme"
```

---

## Task 3: UI 공통 컴포넌트 (Icon, Button, Card, Input)

**Files:**
- Create: `frontend/src/components/ui/Icon.tsx`
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/Input.tsx`
- Create: `frontend/src/components/ui/Modal.tsx`
- Create: `frontend/src/components/ui/index.ts`

**Step 1: Icon 컴포넌트 생성**

```tsx
// frontend/src/components/ui/Icon.tsx
'use client';

const SIZE_MAP = { xs: 16, sm: 20, md: 24, lg: 28, xl: 32, '2xl': 40 } as const;

interface IconProps {
  name: string;
  size?: keyof typeof SIZE_MAP;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 'sm', filled, className = '' }: IconProps) {
  const px = SIZE_MAP[size];
  return (
    <span
      className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}
      style={{ fontSize: px, width: px, height: px, lineHeight: `${px}px` }}
    >
      {name}
    </span>
  );
}
```

**Step 2: Button 컴포넌트 생성**

DESIGN_GUIDELINE의 4가지 variant (primary/secondary/ghost/outline) + 3가지 size (sm/md/lg).

```tsx
// frontend/src/components/ui/Button.tsx
'use client';
import { Icon } from './Icon';

const VARIANT = {
  primary: 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover hover:-translate-y-0.5',
  secondary: 'bg-card border border-border text-text dark:text-white hover:bg-card-hover',
  ghost: 'bg-transparent text-text dark:text-white hover:bg-black/5 dark:hover:bg-white/5',
  outline: 'bg-transparent border border-border text-text dark:text-white hover:bg-card-hover hover:border-border-hover',
} as const;

const SIZE = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-10 px-6 text-sm',
  lg: 'h-12 px-8 text-base',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  leftIcon?: string;
  rightIcon?: string;
  isLoading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary', size = 'md',
  leftIcon, rightIcon, isLoading, fullWidth,
  className = '', children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-bold
        transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
        ${VARIANT[variant]} ${SIZE[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Icon name="progress_activity" size="xs" className="animate-spin" /> : leftIcon && <Icon name={leftIcon} size="xs" />}
      {children}
      {rightIcon && !isLoading && <Icon name={rightIcon} size="xs" />}
    </button>
  );
}
```

**Step 3: Card 컴포넌트 생성**

```tsx
// frontend/src/components/ui/Card.tsx
interface CardProps {
  children: React.ReactNode;
  hover?: boolean;
  noPadding?: boolean;
  className?: string;
}

export function Card({ children, hover, noPadding, className = '' }: CardProps) {
  return (
    <div className={`rounded-2xl border border-border bg-card transition-all duration-200
      ${hover ? 'hover:shadow-lg hover:border-primary/50' : ''}
      ${noPadding ? '' : 'p-6'} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
```

**Step 4: Input 컴포넌트 생성**

```tsx
// frontend/src/components/ui/Input.tsx
'use client';
import { Icon } from './Icon';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leftIcon?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, leftIcon, error, helperText, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">{label}</label>}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            <Icon name={leftIcon} size="xs" />
          </div>
        )}
        <input
          className={`w-full px-4 py-2.5 rounded-lg
            bg-surface dark:bg-surface-dark
            border ${error ? 'border-error focus:ring-error/50 focus:border-error' : 'border-border dark:border-border-dark focus:ring-primary/50 focus:border-primary'}
            text-text dark:text-white placeholder:text-text-secondary
            focus:outline-none focus:ring-2 transition-colors
            ${leftIcon ? 'pl-10' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-text-secondary">{helperText}</p>}
    </div>
  );
}
```

**Step 5: Modal 컴포넌트 생성**

```tsx
// frontend/src/components/ui/Modal.tsx
'use client';
import { useEffect } from 'react';
import { Icon } from './Icon';

const SIZE_MAP = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', full: 'max-w-4xl' } as const;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: keyof typeof SIZE_MAP;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, size = 'md', children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative ${SIZE_MAP[size]} w-full mx-4 bg-background-white dark:bg-surface-dark rounded-xl shadow-xl animate-fade-in`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-border-dark">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface dark:hover:bg-background-dark transition-colors">
            <Icon name="close" size="sm" className="text-text-secondary" />
          </button>
        </div>
        <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
```

**Step 6: 배럴 export**

```tsx
// frontend/src/components/ui/index.ts
export { Icon } from './Icon';
export { Button } from './Button';
export { Card, CardHeader, CardContent } from './Card';
export { Input } from './Input';
export { Modal } from './Modal';
```

**Step 7: 커밋**

```bash
git add frontend/src/components/ui/
git commit -m "feat: add UI components (Icon, Button, Card, Input, Modal)"
```

---

## Task 4: ThemeContext + Providers

**Files:**
- Create: `frontend/src/contexts/ThemeContext.tsx`
- Create: `frontend/src/app/providers.tsx`

**Step 1: ThemeContext 생성**

```tsx
// frontend/src/contexts/ThemeContext.tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: 'light', toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const initial = saved || preferred;
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

**Step 2: Providers 래퍼 생성**

```tsx
// frontend/src/app/providers.tsx
'use client';
import { ThemeProvider } from '@/contexts/ThemeContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
```

**Step 3: 커밋**

```bash
git add frontend/src/contexts/ frontend/src/app/providers.tsx
git commit -m "feat: add ThemeContext and Providers"
```

---

## Task 5: 레이아웃 컴포넌트 (Header, Sidebar)

**Files:**
- Create: `frontend/src/components/layout/Header.tsx`
- Create: `frontend/src/components/layout/Sidebar.tsx`

**Step 1: Header 컴포넌트 생성**

DESIGN_GUIDELINE 7.1-7.3 참조. Vector 로고 + 타이틀 + LIVE 배지 + 시계 + 다크모드 토글.

```tsx
// frontend/src/components/layout/Header.tsx
'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { useTheme } from '@/contexts/ThemeContext';

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-6
      bg-background/90 dark:bg-background-dark/90 backdrop-blur-md
      border-b border-border dark:border-border-dark">
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="lg:hidden p-1.5 rounded-lg hover:bg-surface dark:hover:bg-surface-dark transition-colors">
          <Icon name="menu" size="md" />
        </button>
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-accent
          flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/25">V</div>
        <h1 className="text-base font-semibold tracking-tight">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">Vector</span>
          <span className="text-muted-foreground text-sm font-normal ml-1.5">Collector Management</span>
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full
          bg-success/10 border border-success/20 text-success text-[10px] font-semibold">
          <span className="size-1.5 rounded-full bg-success animate-pulse-glow" />
          LIVE
        </div>
        <span className="hidden sm:block font-mono text-xs text-muted-foreground">{clock}</span>
        <button onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-surface dark:hover:bg-surface-dark transition-colors text-muted-foreground hover:text-foreground">
          <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size="sm" />
        </button>
      </div>
    </header>
  );
}
```

**Step 2: Sidebar 컴포넌트 생성**

DESIGN_GUIDELINE 6.1-6.5 참조. 접기/펴기 토글 + 모바일 오버레이.

```tsx
// frontend/src/components/layout/Sidebar.tsx
'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
  { label: 'Log Viewer', icon: 'description', href: '/dashboard/logs' },
  { label: 'Table Mapping', icon: 'table_chart', href: '/dashboard/mapping' },
  { label: 'Settings', icon: 'settings', href: '/dashboard/settings' },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
        <p className={`text-xs font-bold text-text-secondary uppercase tracking-wider mb-3
          ${collapsed ? 'text-center text-[8px]' : 'px-3'}`}>
          {collapsed ? '•••' : 'Menu'}
        </p>
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href} onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
              ${collapsed ? 'justify-center px-0' : ''}
              ${isActive(item.href)
                ? 'bg-primary/10 text-primary border border-primary/20 font-bold'
                : 'text-text dark:text-white hover:bg-surface dark:hover:bg-surface-dark'}`}>
            <Icon name={item.icon} size="sm"
              className={isActive(item.href) ? 'text-primary' : 'text-text-secondary'} />
            {!collapsed && <span className="text-sm">{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border dark:border-border-dark">
        <p className={`text-[10px] text-muted-foreground ${collapsed ? 'text-center' : ''}`}>
          {collapsed ? 'V' : 'Vector Log Collector'}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static z-50 lg:z-0 h-full
        bg-background-white dark:bg-background-dark
        border-r border-border dark:border-border-dark
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>

        {/* Toggle button (desktop only) */}
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
```

**Step 3: 커밋**

```bash
git add frontend/src/components/layout/
git commit -m "feat: add Header and Sidebar layout components"
```

---

## Task 6: 루트 레이아웃 + 대시보드 레이아웃

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/dashboard/layout.tsx`
- Modify: `frontend/src/app/page.tsx`

**Step 1: 루트 레이아웃 수정**

```tsx
// frontend/src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Vector — Collector Management',
  description: 'Equipment Log Collection Monitoring Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Step 2: 루트 page.tsx — 대시보드 리다이렉트**

```tsx
// frontend/src/app/page.tsx
import { redirect } from 'next/navigation';
export default function Home() { redirect('/dashboard'); }
```

**Step 3: 대시보드 레이아웃 생성**

```tsx
// frontend/src/app/dashboard/layout.tsx
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
```

**Step 4: 빌드 확인**

```bash
cd /c/Project/vector/frontend && npm run build
```

**Step 5: 커밋**

```bash
git add frontend/src/app/
git commit -m "feat: add root layout, dashboard layout, and redirect"
```

---

## Task 7: API 클라이언트 + useMonitor 폴링 훅

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/hooks/useMonitor.ts`
- Modify: `frontend/next.config.ts`

**Step 1: next.config.ts에 API 프록시 설정**

```ts
// frontend/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:3100/api/:path*' },
    ];
  },
};

export default nextConfig;
```

**Step 2: API 클라이언트 생성**

```ts
// frontend/src/lib/api.ts
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
  return res.json();
}

export interface MonitorOverview {
  server: { status: string; uptime: number; timestamp: string; nodeEnv: string };
  redis: { connected: boolean };
  vector: { running: boolean; pid: number | null; apiReachable: boolean; uptime: string | null; version: string | null };
  queue: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  equipments: Array<{ equipment_id: string; online: boolean; last_seen: string; metadata: Record<string, string> }>;
  tables: Array<{ TABLE_NAME: string; COLUMN_COUNT: number }>;
  recentErrors: Array<{ ERROR_ID: number; SOURCE_TABLE: string; EQUIPMENT_ID: string; ERROR_MESSAGE: string; CREATED_AT: string }>;
}

export interface SystemConfig {
  server: { host: string; port: number; nodeEnv: string; nodeVersion: string; platform: string; pid: number; memoryUsage: { rss: number; heapUsed: number; heapTotal: number } };
  oracle: { host: string; service: string; connectString: string; user: string; password: string; poolMin: number; poolMax: number };
  redis: { host: string; port: number; hasPassword: boolean; password: string };
  queue: { concurrency: number; batchSize: number; batchTimeoutMs: number };
  storage: { rawLogBasePath: string };
  heartbeat: { ttlSeconds: number };
}
```

**Step 3: useMonitor 폴링 훅 생성**

```ts
// frontend/src/hooks/useMonitor.ts
'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type MonitorOverview } from '@/lib/api';

export function useMonitor(intervalMs = 5000) {
  const [data, setData] = useState<MonitorOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await apiFetch<MonitorOverview>('/api/monitor/overview');
      setData(d);
      setError(null);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, error, lastUpdate, refresh };
}
```

**Step 4: 커밋**

```bash
git add frontend/next.config.ts frontend/src/lib/ frontend/src/hooks/
git commit -m "feat: add API client, types, useMonitor polling hook, and proxy config"
```

---

## Task 8: Dashboard 메인 페이지

**Files:**
- Create: `frontend/src/app/dashboard/page.tsx`
- Create: `frontend/src/app/dashboard/components/InfraStatusCard.tsx`
- Create: `frontend/src/app/dashboard/components/QueueStats.tsx`
- Create: `frontend/src/app/dashboard/components/CollectorGrid.tsx`
- Create: `frontend/src/app/dashboard/components/ErrorTable.tsx`

**Step 1: InfraStatusCard 컴포넌트**

Server, Redis, Oracle, Vector 상태를 표시하는 카드. Vector에는 Start/Stop 버튼 포함.

```tsx
// frontend/src/app/dashboard/components/InfraStatusCard.tsx
'use client';
import { useState } from 'react';
import { Icon, Card } from '@/components/ui';
import { apiFetch, type MonitorOverview } from '@/lib/api';

/* 시간 포맷 유틸 */
function ago(sec: number) {
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

interface Props { data: MonitorOverview }

export function InfraStatusCard({ data }: Props) {
  const [vecLoading, setVecLoading] = useState(false);

  const infra = [
    { label: 'Server', icon: 'dns', ok: data.server.status === 'ok', val: data.server.status === 'ok' ? `up ${ago(data.server.uptime)}` : 'down' },
    { label: 'Redis', icon: 'bolt', ok: data.redis.connected, val: data.redis.connected ? 'connected' : 'down' },
    { label: 'Oracle', icon: 'database', ok: data.tables.length > 0, val: data.tables.length > 0 ? `${data.tables.length} tables` : 'down' },
  ];

  const toggleVector = async () => {
    setVecLoading(true);
    const ep = data.vector.running ? '/api/monitor/vector/stop' : '/api/monitor/vector/start';
    try { await apiFetch(ep, { method: 'POST' }); } catch {}
    setTimeout(() => setVecLoading(false), 1500);
  };

  return (
    <Card noPadding className="p-4">
      <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">Infrastructure</p>
      <div className="space-y-2">
        {infra.map(i => (
          <div key={i.label} className="flex items-center gap-3 px-1 py-1">
            <span className={`size-2 rounded-full ${i.ok ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-error shadow-[0_0_6px_rgba(239,68,68,0.4)]'}`} />
            <Icon name={i.icon} size="xs" className="text-muted-foreground" />
            <span className="text-sm font-medium flex-1">{i.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{i.val}</span>
          </div>
        ))}
        {/* Vector row with toggle */}
        <div className="flex items-center gap-3 px-1 py-1">
          <span className={`size-2 rounded-full ${data.vector.running ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-error shadow-[0_0_6px_rgba(239,68,68,0.4)]'}`} />
          <Icon name="show_chart" size="xs" className="text-muted-foreground" />
          <span className="text-sm font-medium flex-1">Vector</span>
          <span className="font-mono text-xs text-muted-foreground mr-2">
            {data.vector.running ? (data.vector.uptime || 'ok') : 'stopped'}
          </span>
          <button onClick={toggleVector} disabled={vecLoading}
            className={`font-mono text-[10px] font-bold px-2.5 py-1 rounded-md border transition-all
              ${vecLoading ? 'bg-warning/10 text-warning border-warning/30 cursor-wait'
                : data.vector.running ? 'bg-error/10 text-error border-error/30 hover:bg-error/20'
                : 'bg-success/10 text-success border-success/30 hover:bg-success/20'}`}>
            {vecLoading ? 'Loading...' : data.vector.running ? 'STOP' : 'START'}
          </button>
        </div>
      </div>
    </Card>
  );
}
```

**Step 2: QueueStats 컴포넌트**

```tsx
// frontend/src/app/dashboard/components/QueueStats.tsx
import { Card } from '@/components/ui';

const ITEMS = [
  { key: 'waiting', label: 'Wait', color: 'text-info' },
  { key: 'active', label: 'Active', color: 'text-warning' },
  { key: 'completed', label: 'Done', color: 'text-success' },
  { key: 'failed', label: 'Fail', color: 'text-error' },
] as const;

interface Props { queue: { waiting: number; active: number; completed: number; failed: number } }

export function QueueStats({ queue }: Props) {
  return (
    <Card noPadding className="p-4">
      <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">Queue</p>
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map(i => (
          <div key={i.key} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border dark:border-border-dark">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">{i.label}</span>
            <span className={`font-mono text-sm font-bold tabular-nums ${i.color}`}>
              {(queue[i.key] ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

**Step 3: CollectorGrid 컴포넌트**

```tsx
// frontend/src/app/dashboard/components/CollectorGrid.tsx
import { Icon } from '@/components/ui';

function timeSince(iso: string) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface Equipment {
  equipment_id: string;
  online: boolean;
  last_seen: string;
  metadata: Record<string, string>;
}

export function CollectorGrid({ equipments }: { equipments: Equipment[] }) {
  const online = equipments.filter(e => e.online).length;
  const offline = equipments.length - online;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">Equipment Collectors</p>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{equipments.length}</strong> Total</span>
          <span className="text-success"><strong>{online}</strong> Online</span>
          <span className="text-error"><strong>{offline}</strong> Offline</span>
        </div>
      </div>

      {!equipments.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Icon name="sensors" size="xl" className="opacity-30 mb-3" />
          <p className="text-sm">No collectors registered</p>
          <p className="text-xs opacity-60">Equipment agents will appear here when they send heartbeats</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {equipments.map((eq, i) => (
            <div key={eq.equipment_id}
              className={`group relative rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5
                bg-card hover:bg-card-hover animate-fade-in
                ${eq.online ? 'border-success/20 hover:border-success/40' : 'border-error/20 hover:border-error/40'}`}
              style={{ animationDelay: `${i * 40}ms` }}>
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
                style={{ background: eq.online
                  ? 'linear-gradient(90deg, #22c55e, rgba(34,197,94,0.2))'
                  : 'linear-gradient(90deg, #ef4444, rgba(239,68,68,0.2))' }} />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`size-2.5 rounded-full ${eq.online ? 'bg-success animate-pulse-glow' : 'bg-error'}`} />
                  <span className="font-mono text-sm font-bold">{eq.equipment_id}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md
                  ${eq.online ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                  {eq.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Icon name="schedule" size="xs" /> Last Seen
                </span>
                <span className={`font-mono font-medium ${eq.online ? 'text-success' : 'text-error'}`}>
                  {timeSince(eq.last_seen)}
                </span>
              </div>
              {Object.entries(eq.metadata || {}).filter(([k]) => k !== 'equipment_id' && k !== 'last_seen').length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(eq.metadata).filter(([k]) => k !== 'equipment_id' && k !== 'last_seen')
                    .map(([k, v]) => (
                      <span key={k} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                        {k}: {v}
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 4: ErrorTable 컴포넌트**

```tsx
// frontend/src/app/dashboard/components/ErrorTable.tsx
import { Card, Icon } from '@/components/ui';

interface ErrorRow {
  ERROR_ID: number;
  SOURCE_TABLE: string;
  EQUIPMENT_ID: string;
  ERROR_MESSAGE: string;
  CREATED_AT: string;
}

export function ErrorTable({ errors }: { errors: ErrorRow[] }) {
  return (
    <div>
      <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Recent Errors</p>
      <Card noPadding>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border dark:border-border-dark bg-surface dark:bg-background-dark">
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-36">Time</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-28">Table</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-24">Equipment</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Message</th>
              </tr>
            </thead>
            <tbody>
              {!errors.length ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">
                  <Icon name="check_circle" size="md" className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No errors</p>
                </td></tr>
              ) : errors.map(e => (
                <tr key={e.ERROR_ID} className="border-b border-border/50 dark:border-border-dark/50 hover:bg-surface/50 dark:hover:bg-background-dark/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{e.CREATED_AT}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-primary/10 text-primary">{e.SOURCE_TABLE}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-info/10 text-info">{e.EQUIPMENT_ID}</span>
                  </td>
                  <td className="px-4 py-2.5 text-error text-xs max-w-xs truncate" title={e.ERROR_MESSAGE}>{e.ERROR_MESSAGE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

**Step 5: Dashboard 페이지 조합**

```tsx
// frontend/src/app/dashboard/page.tsx
'use client';
import { useMonitor } from '@/hooks/useMonitor';
import { InfraStatusCard } from './components/InfraStatusCard';
import { QueueStats } from './components/QueueStats';
import { CollectorGrid } from './components/CollectorGrid';
import { ErrorTable } from './components/ErrorTable';
import { Card, Icon } from '@/components/ui';

export default function DashboardPage() {
  const { data, error, lastUpdate } = useMonitor(5000);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="dashboard" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            DASHBOARD
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">/ 모니터링 대시보드</span>
        </h1>
      </div>

      {/* 인프라 + 큐 (사이드 카드) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <InfraStatusCard data={data} />
          <QueueStats queue={data.queue} />
          {/* 등록 테이블 목록 */}
          <Card noPadding className="p-4">
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">Registered Tables</p>
            {!data.tables.length ? (
              <p className="text-xs text-muted-foreground text-center py-3">No tables</p>
            ) : (
              <div className="space-y-1">
                {data.tables.map(t => (
                  <div key={t.TABLE_NAME} className="flex items-center justify-between px-1 py-1.5 border-b border-border/30 last:border-0">
                    <span className="font-mono text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <span className="size-1.5 rounded-sm bg-primary" />
                      {t.TABLE_NAME.replace('LOG_', '')}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{t.COLUMN_COUNT} cols</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* 메인 영역 */}
        <div className="lg:col-span-3 space-y-6">
          <CollectorGrid equipments={data.equipments} />
          <ErrorTable errors={data.recentErrors} />
        </div>
      </div>

      {/* 푸터 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border dark:border-border-dark">
        <span>Vector Log Collection &copy; 2026</span>
        <div className="flex items-center gap-3">
          {lastUpdate && <span>Updated {lastUpdate.toLocaleTimeString('ko-KR', { hour12: false })}</span>}
          {error && <span className="text-error">{error}</span>}
          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px] font-bold">
            {data.server.nodeEnv}
          </span>
        </div>
      </div>
    </>
  );
}
```

**Step 6: 빌드 확인**

```bash
cd /c/Project/vector/frontend && npm run build
```

**Step 7: 커밋**

```bash
git add frontend/src/app/dashboard/
git commit -m "feat: implement Dashboard page with infra status, queue, collectors, errors"
```

---

## Task 9: Log Viewer 페이지

**Files:**
- Create: `frontend/src/app/dashboard/logs/page.tsx`

**Step 1: Log Viewer 페이지 생성**

테이블 선택 → 로그 데이터 조회. DESIGN_GUIDELINE의 리스트 페이지 패턴(9.1-9.6) 적용.

```tsx
// frontend/src/app/dashboard/logs/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Icon, Card, Input, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';

interface LogData { columns: string[]; rows: Record<string, string>[] }

export default function LogsPage() {
  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [logData, setLogData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    apiFetch<{ tables: Array<{ TABLE_NAME: string }> }>('/api/monitor/tables/oracle')
      .then(d => setTables(d.tables.map((t: any) => t.TABLE_NAME || t[0])))
      .catch(() => {});
  }, []);

  const fetchLogs = async (table: string) => {
    if (!table) return;
    setLoading(true);
    try {
      const d = await apiFetch<LogData>(`/api/monitor/logs?table=${table}&limit=${limit}`);
      setLogData(d);
    } catch { setLogData(null); }
    setLoading(false);
  };

  const handleSelect = (t: string) => {
    setSelected(t);
    fetchLogs(t);
  };

  return (
    <>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="description" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">LOG VIEWER</span>
          <span className="text-muted-foreground text-sm font-normal ml-1">/ 로그 조회</span>
        </h1>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Table</label>
          <select value={selected} onChange={e => handleSelect(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-border dark:border-border-dark
              text-sm text-text dark:text-white min-w-[200px]">
            <option value="">Select table...</option>
            {tables.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="w-24">
          <Input label="Limit" type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} />
        </div>
        <Button variant="secondary" leftIcon="refresh" onClick={() => fetchLogs(selected)} disabled={!selected}>
          Reload
        </Button>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
        </div>
      ) : !logData ? (
        <Card className="text-center py-16">
          <Icon name="table_chart" size="xl" className="text-muted-foreground opacity-30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Select a table to view logs</p>
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border dark:border-border-dark bg-surface dark:bg-background-dark">
                  {logData.columns.map(c => (
                    <th key={c} className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!logData.rows.length ? (
                  <tr><td colSpan={logData.columns.length} className="text-center py-8 text-muted-foreground text-xs">No data</td></tr>
                ) : logData.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 dark:border-border-dark/50 hover:bg-surface/50 dark:hover:bg-background-dark/50 transition-colors">
                    {logData.columns.map(c => (
                      <td key={c} className="px-4 py-2 text-xs font-mono whitespace-nowrap max-w-xs truncate">
                        {String((row as any)[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border dark:border-border-dark">
            {logData.rows.length} rows
          </div>
        </Card>
      )}
    </>
  );
}
```

**Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/logs/
git commit -m "feat: implement Log Viewer page"
```

---

## Task 10: Table Mapping 페이지

**Files:**
- Create: `frontend/src/app/dashboard/mapping/page.tsx`

**Step 1: Table Mapping 페이지 생성**

Oracle 테이블 선택 → 컬럼 메타데이터 + 레지스트리 매핑 CRUD.

완전한 구현 코드는 `frontend/src/app/dashboard/mapping/page.tsx`에 작성한다.
주요 기능:
- Oracle 테이블 목록 조회 (좌측 리스트)
- 테이블 선택 시 컬럼 메타데이터 + 레지스트리 매핑 표시
- SOURCE_FIELD, IS_REQUIRED 편집 가능
- 저장 버튼으로 레지스트리 POST

**Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/mapping/
git commit -m "feat: implement Table Mapping page"
```

---

## Task 11: Settings 페이지

**Files:**
- Create: `frontend/src/app/dashboard/settings/page.tsx`

**Step 1: Settings 페이지 생성**

DESIGN_GUIDELINE의 폼 패턴 적용. 6개 섹션 (Server, Oracle, Redis, Queue, Storage, Heartbeat). 읽기 전용 + 수정 모드.

완전한 구현 코드는 `frontend/src/app/dashboard/settings/page.tsx`에 작성한다.
주요 기능:
- GET /api/monitor/config으로 설정 로드
- 각 섹션을 Card로 렌더링
- 비밀번호 마스킹 (••••••••)
- Edit 모드 토글로 수정 가능
- 저장 시 PUT /api/monitor/config 호출
- 재시작 필요 여부 표시

**Step 2: 커밋**

```bash
git add frontend/src/app/dashboard/settings/
git commit -m "feat: implement Settings page"
```

---

## Task 12: 백엔드 정리

**Files:**
- Modify: `src/server/routes/monitor.route.ts` (lines 24, 27-35 제거)
- Delete: `public/monitor.html`

**Step 1: monitor.route.ts에서 HTML 서빙 제거**

`dashboardPath` 상수와 `GET /monitor` 라우트를 제거한다. `readFileSync` import에서 사용처가 없어지면 import도 정리.

**Step 2: monitor.html 삭제**

```bash
rm /c/Project/vector/public/monitor.html
```

public 디렉토리가 비어있으면 삭제:
```bash
rmdir /c/Project/vector/public 2>/dev/null || true
```

**Step 3: 백엔드 빌드 확인**

```bash
cd /c/Project/vector && npm run build
```

**Step 4: 커밋**

```bash
git add src/server/routes/monitor.route.ts
git rm public/monitor.html
git commit -m "refactor: remove HTML serving from backend, delete monitor.html"
```

---

## Task 13: 통합 테스트 및 최종 확인

**Step 1: 백엔드 실행 확인**

```bash
cd /c/Project/vector && npm run dev
```
Expected: `localhost:3100` 실행 중

**Step 2: 프론트엔드 실행 확인**

```bash
cd /c/Project/vector/frontend && npm run dev
```
Expected: `localhost:3000` 접속 → `/dashboard` 리다이렉트 → 대시보드 표시

**Step 3: 페이지별 확인 체크리스트**

- [ ] Dashboard: 인프라 상태, Queue, Collector 카드, 에러 테이블 표시
- [ ] Dashboard: 5초 폴링 동작 확인
- [ ] Dashboard: Vector Start/Stop 버튼 동작
- [ ] Log Viewer: 테이블 선택 → 로그 조회
- [ ] Table Mapping: 테이블 선택 → 매핑 CRUD
- [ ] Settings: 설정 로드 및 수정
- [ ] 다크모드 토글 동작
- [ ] 사이드바 접기/펴기 동작
- [ ] 모바일 반응형 동작

**Step 4: 최종 커밋**

```bash
git add -A
git commit -m "feat: complete Next.js frontend separation from monitor.html"
```
