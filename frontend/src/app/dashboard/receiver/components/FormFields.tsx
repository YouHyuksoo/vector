/**
 * @file src/app/dashboard/receiver/components/FormFields.tsx
 * @description 수신기 설정 폼에서 공통으로 사용하는 UI 서브컴포넌트 모음
 *
 * 초보자 가이드:
 * 1. **Sec**: 아이콘+제목이 있는 섹션 래퍼
 * 2. **F**: 텍스트/숫자 입력 필드 (suffix, tooltip 지원)
 * 3. **SF**: 드롭다운 선택 필드
 * 4. **TF**: 토글 스위치 필드
 * 5. **Tip**: 물음표 호버 시 툴팁 표시 (fixed 위치)
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui';

/** 아이콘+제목 섹션 래퍼 */
export function Sec({ icon, title, hint, children, iconColor = 'text-success' }: {
  icon: string; title: string; hint?: string; children: React.ReactNode; iconColor?: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-surface/50 dark:bg-surface-dark/50 border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Icon name={icon} size="sm" className={iconColor} />
        <span className="text-sm font-bold text-text dark:text-white">{title}</span>
        {hint && <span className="text-[10px] text-muted-foreground ml-1">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** 텍스트/숫자 입력 필드 */
export function F({ label, value, onChange, type = 'text', suffix, placeholder, mono, tooltip }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; suffix?: string; placeholder?: string; mono?: boolean; tooltip?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-0.5 flex items-center gap-0.5">
        {label}
        {tooltip && <Tip text={tooltip} />}
      </label>
      <div className="relative">
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-2 py-1.5 text-xs border rounded-lg
            bg-white dark:bg-slate-800 border-border
            ${mono ? 'font-mono' : ''}
            ${suffix ? 'pr-10' : ''}`} />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/** 드롭다운 선택 필드 */
export function SF({ label, value, onChange, options, tooltip }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; tooltip?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-0.5 flex items-center gap-0.5">
        {label}
        {tooltip && <Tip text={tooltip} />}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-xs border rounded-lg
          bg-white dark:bg-slate-800 border-border"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/** 토글 스위치 필드 */
export function TF({ label, checked, onChange, tooltip }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-0.5 flex-1">
        {label}
        {tooltip && <Tip text={tooltip} />}
      </label>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-success' : 'bg-muted dark:bg-slate-600'
        }`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
      <span className={`text-[10px] w-8 ${checked ? 'text-success' : 'text-muted-foreground'}`}>
        {checked ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

/** 물음표 아이콘 + 호버 시 툴팁 표시 (fixed 포지셔닝으로 사이드바 가림 방지) */
export function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [above, setAbove] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!show || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const tipW = 256;
    const tipH = 120;
    const gap = 8;

    const isAbove = rect.bottom + gap + tipH > window.innerHeight;
    setAbove(isAbove);

    let left = rect.left + rect.width / 2 - tipW / 2;
    if (left < 8) left = 8;
    if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;

    const top = isAbove ? rect.top - gap : rect.bottom + gap;

    setStyle({ position: 'fixed', top, left, width: tipW });

    const arrowLeft = rect.left + rect.width / 2 - left;
    setArrowStyle({ left: arrowLeft });
  }, [show]);

  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Icon name="help" className="text-muted-foreground/60 hover:text-primary cursor-help !text-[14px]" />
      {show && (
        <span
          style={style}
          className="z-[9999] px-3 py-2 text-xs leading-relaxed text-white
            bg-slate-800 dark:bg-slate-700 rounded-lg shadow-lg border border-slate-600"
        >
          {text}
          <span
            style={arrowStyle}
            className={`absolute w-2 h-2 rotate-45 -translate-x-1/2
              bg-slate-800 dark:bg-slate-700 border-slate-600
              ${above ? '-bottom-1 border-r border-b' : '-top-1 border-l border-t'}`}
          />
        </span>
      )}
    </span>
  );
}
