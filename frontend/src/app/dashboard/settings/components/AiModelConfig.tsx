/**
 * @file src/app/dashboard/settings/components/AiModelConfig.tsx
 * @description AI 모델 API 키 등록/관리 + 연결 테스트 컴포넌트
 *
 * 초보자 가이드:
 * 1. **역할**: VRL 코드 자동 생성에 사용할 AI 모델의 API 키를 등록
 * 2. **모델**: Gemini (Google), Mistral, Claude (Anthropic) 지원
 * 3. **활성화**: 토글로 사용할 모델을 선택, API 키가 있어야 활성화 가능
 * 4. **테스트**: API 키 등록 후 [테스트] 버튼으로 연결 상태 즉시 확인
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';

interface ModelEntry {
  apiKey: string;
  model: string;
  enabled: boolean;
}

interface TestResult {
  success: boolean;
  response?: string;
  model?: string;
  latencyMs?: number;
  error?: string;
}

/** 제공사별 선택 가능한 모델 목록 */
const MODEL_OPTIONS: Record<string, Array<{ id: string; label: string }>> = {
  gemini: [
    { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  ],
  mistral: [
    { id: 'mistral-large-latest',  label: 'Mistral Large' },
    { id: 'mistral-small-latest',  label: 'Mistral Small' },
    { id: 'codestral-latest',      label: 'Codestral' },
    { id: 'open-mistral-nemo',     label: 'Mistral Nemo' },
  ],
  claude: [
    { id: 'claude-sonnet-4-20250514',  label: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-20250514',    label: 'Claude Opus 4' },
  ],
};

const MODEL_META: Record<string, { icon: string; color: string; label: string }> = {
  gemini:  { icon: 'auto_awesome', color: 'text-blue-500',   label: 'Google Gemini' },
  mistral: { icon: 'air',          color: 'text-orange-500', label: 'Mistral AI' },
  claude:  { icon: 'psychology',   color: 'text-purple-500', label: 'Anthropic Claude' },
};

/** 모델 ID → 사람이 읽기 편한 라벨 */
function getModelLabel(provider: string, modelId: string): string {
  const opt = MODEL_OPTIONS[provider]?.find(o => o.id === modelId);
  return opt ? opt.label : modelId;
}

export function AiModelConfig() {
  const { t } = useI18n();
  const [models, setModels] = useState<Record<string, ModelEntry>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, ModelEntry>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Record<string, ModelEntry>>('/api/monitor/ai/config');
      setModels(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEdit = () => {
    const vals: Record<string, ModelEntry> = {};
    for (const [k, v] of Object.entries(models)) {
      const options = MODEL_OPTIONS[k];
      const modelExists = options?.some(o => o.id === v.model);
      vals[k] = { ...v, model: modelExists ? v.model : (options?.[0]?.id ?? v.model) };
    }
    setEditValues(vals);
    setEditing(true);
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/monitor/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      });
      setMsg({ ok: true, text: t('ai.saved') });
      setEditing(false);
      load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    }
    setSaving(false);
  };

  /** AI 모델 연결 테스트 */
  const handleTest = async (provider: string) => {
    setTesting(provider);
    setTestResults(prev => ({ ...prev, [provider]: undefined as any }));
    try {
      const res = await apiFetch<TestResult>('/api/monitor/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      setTestResults(prev => ({ ...prev, [provider]: res }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [provider]: { success: false, error: err instanceof Error ? err.message : 'Failed' },
      }));
    }
    setTesting(null);
  };

  if (loading) return null;

  return (
    <Card noPadding>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border dark:border-border-dark">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded flex items-center justify-center bg-purple-500/10">
            <Icon name="smart_toy" size="xs" />
          </div>
          <span className="text-sm font-semibold">{t('ai.title')}</span>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`text-[10px] ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>
          )}
          {editing ? (
            <>
              <Button variant="ghost" onClick={() => setEditing(false)} className="!text-xs !px-2 !py-0.5">
                {t('settings.cancel')}
              </Button>
              <Button variant="primary" leftIcon="save" onClick={save} disabled={saving} className="!text-xs !px-2 !py-0.5">
                {saving ? t('settings.saving') : t('settings.save')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" leftIcon="edit" onClick={startEdit} className="!text-xs !px-2 !py-0.5">
              {t('settings.edit')}
            </Button>
          )}
        </div>
      </div>

      <div className="divide-y divide-border/50 dark:divide-border-dark/50">
        {Object.entries(MODEL_META).map(([key, meta]) => {
          const m = editing ? editValues[key] : models[key];
          if (!m) return null;
          const tr = testResults[key];
          const isTesting = testing === key;

          return (
            <div key={key} className="px-3 py-2 space-y-1.5">
              {/* 헤더 행: 이름 + 상태/테스트 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name={meta.icon} size="xs" className={meta.color} />
                  <span className="text-xs font-semibold">{meta.label}</span>
                  {!editing && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {getModelLabel(key, m.model)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {!editing && m.apiKey && (
                    <Button
                      variant="ghost"
                      leftIcon={isTesting ? 'progress_activity' : 'speed'}
                      onClick={() => handleTest(key)}
                      disabled={isTesting || !m.apiKey}
                      className={`!text-[10px] !px-1.5 !py-0.5 ${isTesting ? 'animate-pulse' : ''}`}
                    >
                      {isTesting ? t('ai.testing') : t('ai.test')}
                    </Button>
                  )}
                  {editing ? (
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <span className="text-[10px] text-muted-foreground">{t('ai.enabled')}</span>
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        onChange={e => setEditValues(prev => ({
                          ...prev, [key]: { ...prev[key], enabled: e.target.checked },
                        }))}
                        className="accent-primary w-3.5 h-3.5"
                      />
                    </label>
                  ) : (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      m.enabled && m.apiKey ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}>
                      {m.enabled && m.apiKey ? t('ai.active') : t('ai.inactive')}
                    </span>
                  )}
                </div>
              </div>

              {/* 편집 모드: API Key + 모델 선택 */}
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={m.apiKey}
                    onChange={e => setEditValues(prev => ({
                      ...prev, [key]: { ...prev[key], apiKey: e.target.value },
                    }))}
                    placeholder="API Key"
                    className="flex-1 px-2 py-1 text-xs font-mono rounded border bg-white dark:bg-slate-800 border-border"
                  />
                  <select
                    value={m.model}
                    onChange={e => setEditValues(prev => ({
                      ...prev, [key]: { ...prev[key], model: e.target.value },
                    }))}
                    className="px-2 py-1 text-xs rounded border bg-white dark:bg-slate-800 border-border"
                  >
                    {MODEL_OPTIONS[key]?.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pl-5">
                  <span>Key: {m.apiKey || '—'}</span>
                  <span>Model: <span className="font-mono">{m.model}</span></span>
                </div>
              )}

              {/* 테스트 결과 */}
              {tr && (
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${
                  tr.success
                    ? 'bg-success/5 border border-success/20 text-success'
                    : 'bg-error/5 border border-error/20 text-error'
                }`}>
                  <Icon name={tr.success ? 'check_circle' : 'error'} size="xs" />
                  <span className="font-medium">
                    {tr.success
                      ? t('ai.testSuccess').replace('{latency}', String(tr.latencyMs ?? 0))
                      : t('ai.testFail').replace('{error}', tr.error || 'Unknown')}
                  </span>
                  {tr.success && tr.response && (
                    <span className="text-muted-foreground truncate ml-1">
                      — {tr.response}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
