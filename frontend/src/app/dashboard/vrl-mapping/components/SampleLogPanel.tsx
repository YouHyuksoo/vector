/**
 * @file components/SampleLogPanel.tsx
 * @description 샘플 로그 입력 패널 — 텍스트 입력, 파일 업로드, 드래그앤드롭
 *
 * 초보자 가이드:
 * 1. 텍스트를 직접 붙여넣거나 파일을 업로드/드래그하여 샘플 로그 입력
 * 2. UTF-8, EUC-KR, UTF-16 LE 인코딩 자동 감지
 */
'use client';

import { useState, useRef, useCallback } from 'react';
import { Icon, Card } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';

interface Props {
  sampleLog: string;
  onSampleLogChange: (v: string) => void;
}

export default function SampleLogPanel({ sampleLog, onSampleLogChange }: Props) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFileAsText = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const isUtf16Le = (() => {
      if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return true;
      if (bytes.length < 4) return false;
      let nullCount = 0;
      const check = Math.min(bytes.length, 100);
      for (let i = 1; i < check; i += 2) if (bytes[i] === 0x00) nullCount++;
      return nullCount > check / 4;
    })();
    if (isUtf16Le) {
      onSampleLogChange(new TextDecoder('utf-16le').decode(bytes));
      return;
    }
    const isUtf8 = (() => {
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b <= 0x7F) continue;
        if (b >= 0xC2 && b <= 0xDF && i + 1 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80) { i += 1; continue; }
        if (b >= 0xE0 && b <= 0xEF && i + 2 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80 && (bytes[i + 2] & 0xC0) === 0x80) { i += 2; continue; }
        return false;
      }
      return true;
    })();
    onSampleLogChange(new TextDecoder(isUtf8 ? 'utf-8' : 'euc-kr').decode(bytes));
  }, [onSampleLogChange]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await readFileAsText(file);
  }, [readFileAsText]);

  return (
    <Card noPadding className="flex-1 min-w-0">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { e.preventDefault(); setDragging(false); }}
        onDrop={handleDrop}
        className="relative p-3 h-full flex flex-col"
      >
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">{t('vrlSim.sampleLog')}</label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
              <Icon name="drag_indicator" size="xs" className="!text-[12px]" />
              {t('vrlSim.dragHint')}
            </span>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors">
              <Icon name="upload_file" size="xs" />
              {t('vrlSim.uploadFile')}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept=".txt,.csv,.log,.tsv"
            onChange={async e => { const f = e.target.files?.[0]; if (f) await readFileAsText(f); e.target.value = ''; }}
            className="hidden" />
        </div>
        <textarea
          value={sampleLog} onChange={e => onSampleLogChange(e.target.value)}
          placeholder={t('vrlSim.sampleLogPlaceholder')}
          className={`w-full flex-1 min-h-[120px] px-3 py-2 text-xs font-mono border rounded-lg resize-y
            bg-white dark:bg-slate-800 transition-colors
            ${dragging ? 'border-primary border-2 bg-primary/5 dark:bg-primary/10' : 'border-border'}`}
        />
        {dragging && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg
            bg-primary/10 dark:bg-primary/20 border-2 border-dashed border-primary pointer-events-none">
            <div className="flex items-center gap-2 text-primary font-medium text-sm">
              <Icon name="file_download" />
              {t('vrlSim.dropFile')}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
