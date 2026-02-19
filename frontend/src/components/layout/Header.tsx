'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/contexts/I18nContext';
import { LOCALE_LABELS, type Locale } from '@/locales';

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const nextLocale: Locale = locale === 'ko' ? 'en' : 'ko';

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
          <span className="text-muted-foreground text-sm font-normal ml-1.5">{t('header.subtitle')}</span>
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full
          bg-success/10 border border-success/20 text-success text-[10px] font-semibold">
          <span className="size-1.5 rounded-full bg-success animate-pulse-glow" />
          {t('header.live')}
        </div>
        <span className="hidden sm:block font-mono text-xs text-muted-foreground">{clock}</span>
        <button onClick={() => setLocale(nextLocale)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold
            hover:bg-surface dark:hover:bg-surface-dark transition-colors text-muted-foreground hover:text-foreground">
          <Icon name="language" size="sm" />
          <span>{LOCALE_LABELS[locale]}</span>
        </button>
        <button onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-surface dark:hover:bg-surface-dark transition-colors text-muted-foreground hover:text-foreground">
          <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size="sm" />
        </button>
      </div>
    </header>
  );
}
