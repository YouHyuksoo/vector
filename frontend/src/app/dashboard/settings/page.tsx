/**
 * @file src/app/dashboard/settings/page.tsx
 * @description 시스템 설정 페이지 — 서버/DB/큐/AI 설정 관리
 *
 * 초보자 가이드:
 * 1. **역할**: 환경변수 기반 시스템 설정을 웹 UI에서 조회/편집
 * 2. **편집**: [편집] 클릭 → 값 변경 → [저장] → 서버 재시작 필요 시 안내
 * 3. **AI**: 하단 AI 모델 섹션에서 API 키 등록 및 연결 테스트
 */
'use client';
import { useState, useEffect } from 'react';
import { Icon, Card, Button } from '@/components/ui';
import { apiFetch, type SystemConfig } from '@/lib/api';
import { useI18n } from '@/contexts/I18nContext';
import { AiModelConfig } from './components/AiModelConfig';

const SECTION_KEYS = ['server', 'oracle', 'redis', 'queue', 'storage', 'heartbeat'] as const;

const SECTION_META: Record<string, { icon: string; iconBg: string }> = {
  server: { icon: 'dns', iconBg: 'bg-success/10' },
  oracle: { icon: 'database', iconBg: 'bg-warning/10' },
  redis: { icon: 'bolt', iconBg: 'bg-error/10' },
  queue: { icon: 'inventory_2', iconBg: 'bg-primary/10' },
  storage: { icon: 'folder_open', iconBg: 'bg-info/10' },
  heartbeat: { icon: 'favorite', iconBg: 'bg-muted' },
};

const EDITABLE_KEYS: Record<string, string[]> = {
  server: ['host', 'port', 'nodeEnv'],
  oracle: ['connectString', 'user', 'password', 'poolMin', 'poolMax'],
  redis: ['host', 'port', 'password'],
  queue: ['concurrency', 'batchSize', 'batchTimeoutMs'],
  storage: ['rawLogBasePath'],
  heartbeat: ['ttlSeconds'],
};

const KEY_MAP: Record<string, string> = {
  host: 'HOST', port: 'PORT', nodeEnv: 'NODE_ENV',
  connectString: 'ORACLE_CONNECT_STRING', user: 'ORACLE_USER', password: 'ORACLE_PASSWORD',
  poolMin: 'ORACLE_POOL_MIN', poolMax: 'ORACLE_POOL_MAX',
  'redis.host': 'REDIS_HOST', 'redis.port': 'REDIS_PORT', 'redis.password': 'REDIS_PASSWORD',
  concurrency: 'QUEUE_CONCURRENCY', batchSize: 'BATCH_SIZE', batchTimeoutMs: 'BATCH_TIMEOUT_MS',
  rawLogBasePath: 'RAW_LOG_BASE_PATH', ttlSeconds: 'HEARTBEAT_TTL_SECONDS',
};

export default function SettingsPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [connTesting, setConnTesting] = useState<string | null>(null);
  const [connResults, setConnResults] = useState<Record<string, { success: boolean; latencyMs?: number; error?: string }>>({});
  const { t } = useI18n();

  const loadConfig = async () => {
    setLoading(true);
    try {
      const d = await apiFetch<SystemConfig>('/api/monitor/config');
      setConfig(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadConfig(); }, []);

  /** Oracle / Redis 접속 테스트 */
  const handleTestConnection = async (type: 'oracle' | 'redis') => {
    setConnTesting(type);
    setConnResults(prev => { const next = { ...prev }; delete next[type]; return next; });
    try {
      const res = await apiFetch<{ success: boolean; latencyMs?: number; error?: string }>(
        '/api/monitor/test-connection',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) },
      );
      setConnResults(prev => ({ ...prev, [type]: res }));
    } catch (err) {
      setConnResults(prev => ({
        ...prev,
        [type]: { success: false, error: err instanceof Error ? err.message : 'Failed' },
      }));
    }
    setConnTesting(null);
  };

  const startEdit = () => {
    if (!config) return;
    const vals: Record<string, string> = {};
    for (const [section, keys] of Object.entries(EDITABLE_KEYS)) {
      for (const key of keys) {
        const sectionData = config[section as keyof SystemConfig] as Record<string, any>;
        const envKey = section === 'redis' && (key === 'host' || key === 'port' || key === 'password')
          ? `REDIS_${key.toUpperCase()}`
          : KEY_MAP[key] || key.toUpperCase();
        vals[envKey] = String(sectionData?.[key] ?? '');
      }
    }
    setEditValues(vals);
    setEditing(true);
    setSaveResult(null);
  };

  const saveConfig = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await apiFetch<{ success: boolean; needsRestart: boolean; updated: string[] }>('/api/monitor/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      });
      const msg = t('settings.savedMsg').replace('{count}', String(res.updated.length))
        + (res.needsRestart ? t('settings.restartMsg') : '');
      setSaveResult({ success: true, message: msg });
      setEditing(false);
      loadConfig();
    } catch (err) {
      setSaveResult({ success: false, message: err instanceof Error ? err.message : t('settings.saveFailed') });
    }
    setSaving(false);
  };

  const renderValue = (section: string, key: string, value: any) => {
    if (key === 'password' && value === '••••••••') return <span className="text-muted-foreground">••••••••</span>;
    if (key === 'memoryUsage') {
      const mem = value as { rss: number; heapUsed: number; heapTotal: number };
      const pct = mem.heapTotal > 0 ? Math.round(mem.heapUsed / mem.heapTotal * 100) : 0;
      return (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-border dark:bg-border-dark rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-xs">{mem.heapUsed}/{mem.heapTotal}MB</span>
        </div>
      );
    }
    if (typeof value === 'boolean') return value ? t('settings.yes') : t('settings.no');
    return String(value);
  };

  const renderSection = (sectionKey: string) => {
    if (!config) return null;
    const sectionData = config[sectionKey as keyof SystemConfig] as Record<string, any>;
    if (!sectionData) return null;
    const meta = SECTION_META[sectionKey];

    const isTestable = sectionKey === 'oracle' || sectionKey === 'redis';
    const isTesting = connTesting === sectionKey;
    const testResult = connResults[sectionKey];

    return (
      <Card noPadding key={sectionKey}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <div className={`size-6 rounded flex items-center justify-center ${meta.iconBg}`}>
              <Icon name={meta.icon} size="xs" />
            </div>
            <span className="text-sm font-semibold">{t(`settings.sections.${sectionKey}`)}</span>
          </div>
          {isTestable && !editing && (
            <div className="flex items-center gap-1.5">
              {testResult && (
                <span className={`flex items-center gap-1 text-[10px] font-medium ${
                  testResult.success ? 'text-success' : 'text-error'
                }`}>
                  <Icon name={testResult.success ? 'check_circle' : 'error'} size="xs" />
                  {testResult.success
                    ? t('settings.testConnSuccess').replace('{latency}', String(testResult.latencyMs ?? 0))
                    : t('settings.testConnFail').replace('{error}', testResult.error || 'Unknown')}
                </span>
              )}
              <Button
                variant="ghost"
                leftIcon={isTesting ? 'progress_activity' : 'speed'}
                onClick={() => handleTestConnection(sectionKey as 'oracle' | 'redis')}
                disabled={isTesting}
                className={`!text-[10px] !px-1.5 !py-0.5 ${isTesting ? 'animate-pulse' : ''}`}
              >
                {isTesting ? t('settings.testingConn') : t('settings.testConn')}
              </Button>
            </div>
          )}
        </div>
        <div className="divide-y divide-border/50 dark:divide-border-dark/50">
          {Object.entries(sectionData).map(([key, value]) => {
            const envKey = sectionKey === 'redis' && (key === 'host' || key === 'port' || key === 'password')
              ? `REDIS_${key.toUpperCase()}`
              : KEY_MAP[key] || key.toUpperCase();
            const isEditable = editing && EDITABLE_KEYS[sectionKey]?.includes(key);

            return (
              <div key={key} className="flex items-center justify-between px-3 py-1.5 hover:bg-surface/50 dark:hover:bg-background-dark/50 transition-colors">
                <span className="text-xs text-muted-foreground font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                {isEditable ? (
                  <input
                    type={key === 'password' ? 'password' : 'text'}
                    value={editValues[envKey] || ''}
                    onChange={e => setEditValues(prev => ({ ...prev, [envKey]: e.target.value }))}
                    className="px-2 py-0.5 rounded text-xs font-mono text-right w-44
                      bg-surface dark:bg-surface-dark border border-primary/30
                      text-text dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                ) : (
                  <span className="font-mono text-xs text-foreground font-medium text-right max-w-[200px] truncate">
                    {renderValue(sectionKey, key, value)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    );
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Icon name="settings" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">{t('settings.title')}</span>
          <span className="text-muted-foreground text-xs font-normal ml-1">/ {t('settings.subtitle')}</span>
        </h1>
        <div className="flex items-center gap-2">
          {saveResult && (
            <span className={`text-xs font-medium ${saveResult.success ? 'text-success' : 'text-error'}`}>
              {saveResult.message}
            </span>
          )}
          {editing ? (
            <>
              <Button variant="ghost" onClick={() => setEditing(false)} className="!text-xs !px-2 !py-1">{t('settings.cancel')}</Button>
              <Button variant="primary" leftIcon="save" onClick={saveConfig} disabled={saving} className="!text-xs !px-2 !py-1">
                {saving ? t('settings.saving') : t('settings.save')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" leftIcon="refresh" onClick={loadConfig} className="!text-xs !px-2 !py-1">{t('settings.refresh')}</Button>
              <Button variant="primary" leftIcon="edit" onClick={startEdit} className="!text-xs !px-2 !py-1">{t('settings.edit')}</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {SECTION_KEYS.map(s => renderSection(s))}
      </div>

      {/* AI 모델 설정 */}
      <AiModelConfig />
    </>
  );
}
