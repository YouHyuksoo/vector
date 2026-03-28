/**
 * @file src/app/dashboard/sender/page.tsx
 * @description 송신기(Agent) 설비별 TOML 설정 관리 페이지
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 설비 유형별(SP, SPI, MAOI 등) 독립 TOML 설정 관리
 * 2. **좌측 패널**: 공통 EquipmentSidePanel — 5단계 파이프라인 진행률 + 추가/삭제/설명 편집
 * 3. **우측 패널**: 선택된 설비의 TOML 에디터 + 다운로드 (Vector) 또는 Fluent Bit 설정 패널
 * 4. **모드 전환**: 헤더의 Vector / Fluent Bit 토글로 에이전트 종류 전환
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, Button, Modal, Input } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { EquipmentSidePanel } from '@/components/pipeline';
import { AgentConfigPanel } from './components/AgentConfigPanel';
import { FluentConfigPanel } from './components/FluentConfigPanel';
import { usePipelineStatus } from '@/hooks/usePipelineStatus';

export default function SenderPage() {
  const [agentMode, setAgentMode] = useState<'vector' | 'fluent'>('vector');
  const [names, setNames] = useState<string[]>([]);
  const [fluentNames, setFluentNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  type DescEntry = string | { description?: string; encoding?: string };
  const [rawDescs, setRawDescs] = useState<Record<string, DescEntry>>({});
  const getDescStr = (e?: DescEntry) => typeof e === 'string' ? e : e?.description ?? '';
  const getEncStr = (e?: DescEntry) => typeof e === 'object' && e?.encoding ? e.encoding : 'utf-8';
  const descriptions: Record<string, string> = Object.fromEntries(
    Object.entries(rawDescs).map(([k, v]) => [k, getDescStr(v)])
  );
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [addError, setAddError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { t } = useI18n();

  const { agents: pipelineStatus, refresh: refreshPipeline } = usePipelineStatus(refreshKey);
  void refreshPipeline;

  const fetchNames = useCallback(async () => {
    try {
      const [vecData, flData] = await Promise.all([
        apiFetch<{ names: string[]; descriptions?: Record<string, DescEntry> }>('/api/monitor/agent/configs'),
        apiFetch<{ names: string[] }>('/api/monitor/agent-fluent/configs'),
      ]);
      setNames(vecData.names);
      setFluentNames(flData.names);
      setRawDescs(vecData.descriptions || {});
      setSelected(prev => (!prev && vecData.names.length > 0) ? vecData.names[0] : prev);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNames(); }, [fetchNames]);

  const isFluent = agentMode === 'fluent';
  const activeNames = isFluent ? fluentNames : names;

  const handleModeChange = (mode: 'vector' | 'fluent') => {
    setAgentMode(mode);
    const list = mode === 'fluent' ? fluentNames : names;
    setSelected(list.length > 0 ? list[0] : null);
  };

  const handleAdd = async () => {
    const trimmed = newName.trim().toUpperCase();
    if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      setAddError(t('sender.invalidName'));
      return;
    }
    try {
      const url = isFluent ? '/api/monitor/agent-fluent/configs' : '/api/monitor/agent/configs';
      const body = isFluent
        ? { name: trimmed }
        : { name: trimmed, description: newDesc.trim() || undefined };
      await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setShowAdd(false);
      setNewName('');
      setNewDesc('');
      setAddError('');
      await fetchNames();
      setSelected(trimmed);
      setRefreshKey(k => k + 1);
    } catch {
      setAddError(t('sender.addFailed'));
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      const url = isFluent
        ? `/api/monitor/agent-fluent/config/${selected}`
        : `/api/monitor/agent/config/${selected}`;
      await apiFetch(url, { method: 'DELETE' });
      setShowDelete(false);
      const remaining = activeNames.filter(n => n !== selected);
      setSelected(remaining.length > 0 ? remaining[0] : null);
      await fetchNames();
      setRefreshKey(k => k + 1);
    } catch { /* ignore */ }
  };

  const handleDescUpdate = async (name: string, desc: string, enc?: string) => {
    try {
      await apiFetch(`/api/monitor/agent/description/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, ...(enc ? { encoding: enc } : {}) }),
      });
      setRawDescs(prev => ({
        ...prev,
        [name]: { description: desc, encoding: enc ?? getEncStr(prev[name]) },
      }));
    } catch { /* ignore */ }
  };

  const handleDownload = () => {
    if (!selected) return;
    window.open(`/api/monitor/agent/config/${selected}/download`, '_blank');
  };

  const handleSaved = async () => {
    await fetchNames();
    setRefreshKey(k => k + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" size="xl" className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Icon name="upload" className="text-accent" />
          <h1 className="text-xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-accent to-primary">
            {t('sender.title')}
          </h1>
          <span className="text-muted-foreground text-sm font-normal">/ {t('sender.subtitle')}</span>
        </div>
        {/* Vector / Fluent Bit 모드 전환 */}
        <div className="flex gap-2">
          <button
            onClick={() => handleModeChange('vector')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all border-2
              ${!isFluent
                ? 'border-accent bg-accent/10 text-text dark:text-white'
                : 'border-border dark:border-border-dark text-muted-foreground hover:border-accent/40'}`}
          >
            <Icon name="terminal" size="sm" />
            Vector (.toml)
          </button>
          <button
            onClick={() => handleModeChange('fluent')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all border-2
              ${isFluent
                ? 'border-info bg-info/10 text-text dark:text-white'
                : 'border-border dark:border-border-dark text-muted-foreground hover:border-info/40'}`}
          >
            <Icon name="air" size="sm" />
            Fluent Bit (.conf)
          </button>
        </div>
      </div>

      {/* 메인 레이아웃: 좌측 사이드 패널 + 우측 설정 패널 */}
      <div className="border border-border dark:border-border-dark rounded-xl flex-1 min-h-0 flex overflow-hidden mt-6">
        {/* 좌측 설비 사이드 패널 */}
        <EquipmentSidePanel
          agents={pipelineStatus}
          selected={selected}
          onSelect={setSelected}
          names={activeNames}
          onAdd={() => setShowAdd(true)}
          onDelete={() => setShowDelete(true)}
          descriptions={isFluent ? undefined : descriptions}
          onDescriptionUpdate={isFluent ? undefined : handleDescUpdate}
          fluentMode={isFluent}
        />

        {/* 우측 설정 패널 */}
        <div className="flex-1 min-w-0 min-h-0 p-4 overflow-y-auto">
          {selected ? (
            isFluent ? (
              <FluentConfigPanel key={selected} name={selected} onSaved={handleSaved} />
            ) : (
              <AgentConfigPanel
                key={selected}
                name={selected}
                onDownload={handleDownload}
                description={descriptions[selected] || ''}
                encoding={getEncStr(rawDescs[selected])}
                onDescriptionSave={(desc, enc) => handleDescUpdate(selected, desc, enc)}
                onSaved={handleSaved}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground gap-2">
              <Icon name="inventory_2" size="xl" />
              <p className="text-sm">{t('sender.selectPrompt')}</p>
            </div>
          )}
        </div>
      </div>

      {/* 추가 모달 */}
      <Modal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setAddError(''); }}
        title={t('sender.addTitle')}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t('sender.nameLabel')}
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddError(''); }}
            placeholder="예: MOUNTER"
            error={addError}
          />
          {!isFluent && (
            <div>
              <label className="block text-sm font-medium text-text dark:text-white mb-1">
                {t('sender.descLabel')}
              </label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder={t('sender.descPlaceholder')}
                className="w-full rounded-lg border border-border dark:border-border-dark bg-surface dark:bg-surface-dark
                  px-3 py-2 text-sm text-text dark:text-white placeholder:text-muted-foreground
                  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>{t('aggregator.later')}</Button>
            <Button variant="primary" leftIcon="add" onClick={handleAdd}>{t('sender.add')}</Button>
          </div>
        </div>
      </Modal>

      {/* 삭제 확인 모달 */}
      <Modal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        title={t('sender.deleteConfirm')}
        size="sm"
      >
        <p className="text-sm text-muted-foreground mb-4">
          <strong className="text-error">{selected}</strong> {t('sender.deleteMsg')}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setShowDelete(false)}>{t('aggregator.later')}</Button>
          <Button
            variant="primary"
            leftIcon="delete"
            onClick={handleDelete}
            className="!bg-error hover:!bg-error/80"
          >
            {t('sender.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
