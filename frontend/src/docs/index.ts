/**
 * @file index.ts
 * @description 도움말 문서 메타데이터 및 locale별 마크다운 import 허브.
 *   문서 추가 시 TOPICS 배열에 항목을 추가하고, 해당 언어 import를 추가하면 됩니다.
 */

/* ── 시스템 가이드 ── */
import koInstallation from './ko/installation.md';
import koServerConfig from './ko/server-config.md';
import koWorkflow from './ko/workflow.md';
import koAgentConfig from './ko/agent-config.md';
import koTroubleshooting from './ko/troubleshooting.md';
import koFastifyServer from './ko/fastify-server.md';
import koRedis from './ko/redis.md';

import enInstallation from './en/installation.md';
import enServerConfig from './en/server-config.md';
import enWorkflow from './en/workflow.md';
import enAgentConfig from './en/agent-config.md';
import enTroubleshooting from './en/troubleshooting.md';
import enFastifyServer from './en/fastify-server.md';
import enRedis from './en/redis.md';

/* ── 메뉴별 사용설명 ── */
import koMenuDashboard from './ko/menu-dashboard.md';
import koMenuLogs from './ko/menu-logs.md';
import koMenuErrors from './ko/menu-errors.md';
import koMenuMapping from './ko/menu-mapping.md';
import koMenuReceiver from './ko/menu-receiver.md';
import koMenuSimulator from './ko/menu-simulator.md';
import koMenuSender from './ko/menu-sender.md';
import koMenuDownload from './ko/menu-download.md';
import koMenuSettings from './ko/menu-settings.md';

import enMenuDashboard from './en/menu-dashboard.md';
import enMenuLogs from './en/menu-logs.md';
import enMenuErrors from './en/menu-errors.md';
import enMenuMapping from './en/menu-mapping.md';
import enMenuReceiver from './en/menu-receiver.md';
import enMenuSimulator from './en/menu-simulator.md';
import enMenuSender from './en/menu-sender.md';
import enMenuDownload from './en/menu-download.md';
import enMenuSettings from './en/menu-settings.md';

import type { Locale } from '@/locales';

export interface DocTopic {
  id: string;
  icon: string;
  labelKey: string;
  group: 'guide' | 'menu';
}

/** 도움말 토픽 목록 — 순서대로 좌측 네비게이션에 표시 */
export const TOPICS: DocTopic[] = [
  /* 시스템 가이드 */
  { id: 'installation', icon: 'download', labelKey: 'help.topics.installation', group: 'guide' },
  { id: 'server-config', icon: 'dns', labelKey: 'help.topics.serverConfig', group: 'guide' },
  { id: 'workflow', icon: 'account_tree', labelKey: 'help.topics.workflow', group: 'guide' },
  { id: 'agent-config', icon: 'settings_remote', labelKey: 'help.topics.agentConfig', group: 'guide' },
  { id: 'troubleshooting', icon: 'build', labelKey: 'help.topics.troubleshooting', group: 'guide' },
  { id: 'fastify-server', icon: 'memory', labelKey: 'help.topics.fastifyServer', group: 'guide' },
  { id: 'redis', icon: 'bolt', labelKey: 'help.topics.redis', group: 'guide' },
  /* 메뉴별 사용설명 */
  { id: 'menu-dashboard', icon: 'dashboard', labelKey: 'help.topics.menuDashboard', group: 'menu' },
  { id: 'menu-logs', icon: 'description', labelKey: 'help.topics.menuLogs', group: 'menu' },
  { id: 'menu-errors', icon: 'error', labelKey: 'help.topics.menuErrors', group: 'menu' },
  { id: 'menu-mapping', icon: 'swap_horiz', labelKey: 'help.topics.menuMapping', group: 'menu' },
  { id: 'menu-receiver', icon: 'download', labelKey: 'help.topics.menuReceiver', group: 'menu' },
  { id: 'menu-simulator', icon: 'science', labelKey: 'help.topics.menuSimulator', group: 'menu' },
  { id: 'menu-sender', icon: 'upload', labelKey: 'help.topics.menuSender', group: 'menu' },
  { id: 'menu-download', icon: 'file_download', labelKey: 'help.topics.menuDownload', group: 'menu' },
  { id: 'menu-settings', icon: 'settings', labelKey: 'help.topics.menuSettings', group: 'menu' },
];

/** locale × topicId → 마크다운 문자열 매핑 */
const DOC_MAP: Record<Locale, Record<string, string>> = {
  ko: {
    installation: koInstallation,
    'server-config': koServerConfig,
    workflow: koWorkflow,
    'agent-config': koAgentConfig,
    troubleshooting: koTroubleshooting,
    'fastify-server': koFastifyServer,
    redis: koRedis,
    'menu-dashboard': koMenuDashboard,
    'menu-logs': koMenuLogs,
    'menu-errors': koMenuErrors,
    'menu-mapping': koMenuMapping,
    'menu-receiver': koMenuReceiver,
    'menu-simulator': koMenuSimulator,
    'menu-sender': koMenuSender,
    'menu-download': koMenuDownload,
    'menu-settings': koMenuSettings,
  },
  en: {
    installation: enInstallation,
    'server-config': enServerConfig,
    workflow: enWorkflow,
    'agent-config': enAgentConfig,
    troubleshooting: enTroubleshooting,
    'fastify-server': enFastifyServer,
    redis: enRedis,
    'menu-dashboard': enMenuDashboard,
    'menu-logs': enMenuLogs,
    'menu-errors': enMenuErrors,
    'menu-mapping': enMenuMapping,
    'menu-receiver': enMenuReceiver,
    'menu-simulator': enMenuSimulator,
    'menu-sender': enMenuSender,
    'menu-download': enMenuDownload,
    'menu-settings': enMenuSettings,
  },
};

/** 특정 locale·토픽의 마크다운 콘텐츠를 반환 */
export function getDocContent(locale: Locale, topicId: string): string {
  return DOC_MAP[locale]?.[topicId] ?? DOC_MAP.ko[topicId] ?? '';
}
