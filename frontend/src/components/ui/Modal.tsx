'use client';
import { useEffect } from 'react';
import { Icon } from './Icon';

const SIZE_MAP = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '4xl': 'max-w-4xl', '6xl': 'max-w-6xl', full: 'max-w-4xl' } as const;

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
