import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const docsDir = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(docsDir, 'index.ts'), 'utf8');

const currentMenuTopics = [
  'menu-dashboard',
  'menu-equipment',
  'menu-sender',
  'menu-receiver',
  'menu-vrl-mapping',
  'menu-log-files',
  'menu-system-logs',
  'menu-diagnose',
  'menu-upload',
  'menu-download',
  'menu-settings',
];

test('현재 사이드바 메뉴마다 한국어 도움말 토픽과 문서가 있다', () => {
  for (const topic of currentMenuTopics) {
    assert.match(indexSource, new RegExp(`id: '${topic}'`), `${topic} 토픽이 없습니다.`);
    assert.equal(
      existsSync(join(docsDir, 'ko', `${topic}.md`)),
      true,
      `ko/${topic}.md 문서가 없습니다.`,
    );
  }
});

test('현재 아키텍처 도움말은 제거된 Redis/BullMQ 큐를 안내하지 않는다', () => {
  for (const file of ['workflow.md', 'fastify-server.md', 'redis.md']) {
    const content = readFileSync(join(docsDir, 'ko', file), 'utf8');
    assert.doesNotMatch(content, /BullMQ 큐를 통한|Redis SETEX|src\/queue|src\/redis/);
  }
});

test('모든 locale에 현재 메뉴 도움말 라벨이 선언되어 있다', () => {
  const localeDir = join(docsDir, '..', 'locales');
  const requiredKeys = [
    'menuEquipment',
    'menuVrlMapping',
    'menuLogFiles',
    'menuSystemLogs',
    'menuDiagnose',
    'menuUpload',
  ];

  for (const locale of ['ko', 'en', 'es']) {
    const messages = JSON.parse(readFileSync(join(localeDir, `${locale}.json`), 'utf8'));
    for (const key of requiredKeys) {
      assert.equal(typeof messages.help?.topics?.[key], 'string', `${locale}.${key} 라벨이 없습니다.`);
    }
  }
});
