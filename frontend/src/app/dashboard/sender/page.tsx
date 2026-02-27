/**
 * @file src/app/dashboard/sender/page.tsx
 * @description 송신기(Agent) 설비별 TOML 설정 관리 페이지
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 설비 유형별(SP, SPI, MAOI 등) 독립 TOML 설정 관리
 * 2. **좌측 패널**: 설비 목록 + 추가/삭제
 * 3. **우측 패널**: 선택된 설비의 TOML 에디터 + 다운로드
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, Button, Modal, Input } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { EquipmentList } from './components/EquipmentList';
import { AgentConfigPanel } from './components/AgentConfigPanel';

export default function SenderPage() {
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [addError, setAddError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const { t } = useI18n();

  const fetchNames = useCallback(async () => {
    try {
      const data = await apiFetch<{ names: string[]; descriptions?: Record<string, string> }>('/api/monitor/agent/configs');
      setNames(data.names);
      setDescriptions(data.descriptions || {});
      if (!selected && data.names.length > 0) setSelected(data.names[0]);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNames(); }, [fetchNames]);

  const handleAdd = async () => {
    const trimmed = newName.trim().toUpperCase();
    if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      setAddError(t('sender.invalidName'));
      return;
    }
    try {
      await apiFetch('/api/monitor/agent/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: newDesc.trim() || undefined }),
      });
      setShowAdd(false);
      setNewName('');
      setNewDesc('');
      setAddError('');
      await fetchNames();
      setSelected(trimmed);
    } catch {
      setAddError(t('sender.addFailed'));
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      await apiFetch(`/api/monitor/agent/config/${selected}`, { method: 'DELETE' });
      setShowDelete(false);
      const remaining = names.filter(n => n !== selected);
      setSelected(remaining.length > 0 ? remaining[0] : null);
      await fetchNames();
    } catch { /* ignore */ }
  };

  const handleDescUpdate = async (name: string, desc: string) => {
    try {
      await apiFetch(`/api/monitor/agent/description/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      });
      setDescriptions(prev => ({ ...prev, [name]: desc }));
    } catch { /* ignore */ }
  };

  const handleDownload = () => {
    if (!selected) return;
    window.open(`/api/monitor/agent/config/${selected}/download`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-2">
        <Icon name="upload" className="text-accent" />
        <h1 className="text-xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-accent to-primary">
          {t('sender.title')}
        </h1>
        <span className="text-muted-foreground text-sm font-normal">/ {t('sender.subtitle')}</span>
      </div>

      {/* 좌우 분할 */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* 좌측: 설비 목록 */}
        <EquipmentList
          names={names}
          descriptions={descriptions}
          selected={selected}
          onSelect={setSelected}
          onAdd={() => setShowAdd(true)}
          onDelete={() => setShowDelete(true)}
          onDescriptionUpdate={handleDescUpdate}
        />

        {/* 우측: TOML 에디터 */}
        <div className="flex flex-col gap-3">
          {selected ? (
            <AgentConfigPanel
              key={selected} name={selected} onDownload={handleDownload}
              description={descriptions[selected] || ''}
              onDescriptionSave={desc => handleDescUpdate(selected, desc)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
              <Icon name="inventory_2" size="xl" />
              <p className="text-sm">{t('sender.selectPrompt')}</p>
            </div>
          )}
        </div>
      </div>

      {/* 추가 모달 */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setAddError(''); }} title={t('sender.addTitle')} size="sm">
        <div className="flex flex-col gap-4">
          <Input
            label={t('sender.nameLabel')}
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddError(''); }}
            placeholder="예: MOUNTER"
            error={addError}
          />
          <div>
            <label className="block text-sm font-medium text-text dark:text-white mb-1">{t('sender.descLabel')}</label>
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder={t('sender.descPlaceholder')}
              className="w-full rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark
                px-3 py-2 text-sm text-text dark:text-white placeholder:text-muted-foreground
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>{t('aggregator.later')}</Button>
            <Button variant="primary" leftIcon="add" onClick={handleAdd}>{t('sender.add')}</Button>
          </div>
        </div>
      </Modal>

      {/* 삭제 확인 모달 */}
      <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title={t('sender.deleteConfirm')} size="sm">
        <p className="text-sm text-muted-foreground mb-4">
          <strong className="text-error">{selected}</strong> {t('sender.deleteMsg')}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setShowDelete(false)}>{t('aggregator.later')}</Button>
          <Button variant="primary" leftIcon="delete" onClick={handleDelete} className="!bg-error hover:!bg-error/80">
            {t('sender.delete')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
