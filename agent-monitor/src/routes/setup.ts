/**
 * @file agent-monitor/src/routes/setup.ts
 * @description 설비 정보 조회/수정 API — TOML의 heartbeat tags + add_metadata 동시 반영
 *
 * 초보자 가이드:
 * 1. GET /api/setup  - 현재 TOML에서 설비 정보(equipment_id, equipment_type, ip 등) 추출
 * 2. PUT /api/setup  - 폼에서 입력한 값을 TOML에 반영 (heartbeat tags + add_metadata 동기화)
 * 3. agent-toml-helpers.ts의 getMeta/setMeta/syncHeartbeatTags 로직을 직접 구현 (프론트 의존성 없이)
 */

import { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { ENV } from '../server.js';

/** 설비 정보 필드 */
interface SetupFields {
  equipment_id: string;
  equipment_type: string;
  ip: string;
  line_code: string;
  log_type: string;
  include_paths: string;
  sink_address: string;
  sink_port: string;
}

/** VRL source에서 .key = "value" 추출 */
function getMeta(content: string, key: string): string {
  const m = content.match(new RegExp(`\\.${key}\\s*=\\s*"([^"]*)"`));
  return m?.[1] ?? '';
}

/** VRL source에서 .key = "value" 교체 */
function setMeta(content: string, key: string, value: string): string {
  return content.replace(
    new RegExp(`(\\.${key}\\s*=\\s*")([^"]*)(")`, 'm'),
    `$1${value}$3`,
  );
}

/** heartbeat tags에서 키 값 추출 */
function getHeartbeatTag(content: string, key: string): string {
  const m = content.match(new RegExp(
    `\\[sources\\.heartbeat\\.metrics\\.tags\\][\\s\\S]*?${key}\\s*=\\s*"([^"]*)"`,
  ));
  return m?.[1] ?? '';
}

/** heartbeat tags에서 키 값 교체 (없으면 추가) */
function setHeartbeatTag(content: string, key: string, value: string): string {
  const tagRegex = new RegExp(
    `(\\[sources\\.heartbeat\\.metrics\\.tags\\][\\s\\S]*?)${key}\\s*=\\s*"[^"]*"`,
  );
  if (tagRegex.test(content)) {
    return content.replace(tagRegex, `$1${key} = "${value}"`);
  }
  /* 키가 없으면 tags 섹션 마지막에 추가 */
  const sectionRegex = /(\[sources\.heartbeat\.metrics\.tags\][^\[]*)/;
  const m = content.match(sectionRegex);
  if (m) {
    const section = m[1].trimEnd();
    return content.replace(sectionRegex, `${section}\n${key} = "${value}"\n`);
  }
  return content;
}

/** sink address 추출 */
function getSinkAddr(content: string): [string, string] {
  const m = content.match(/\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*"([^:]+):(\d+)"/);
  return m ? [m[1], m[2]] : ['', ''];
}

/** sink address 교체 */
function setSinkAddr(content: string, ip: string, port: string): string {
  return content.replace(
    /(\[sinks\.to_aggregator\][\s\S]*?address\s*=\s*")[^"]*(")/,
    `$1${ip}:${port}$2`,
  );
}

/** include 배열 추출 */
function getInclude(content: string): string {
  const m = content.match(/include\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return '';
  return m[1].split('\n').map(l => l.replace(/[",]/g, '').trim())
    .filter(Boolean).map(p => p.replace(/\\\\/g, '\\')).join('\n');
}

/** include 배열 교체 */
function setInclude(content: string, paths: string): string {
  const lines = paths.split('\n').map(p => p.trim()).filter(Boolean);
  const escaped = lines.map(p => `  "${p.replace(/\\/g, '\\\\')}",`).join('\n');
  const newInclude = `include = [\n${escaped}\n]`;
  return content.replace(/include\s*=\s*\[[\s\S]*?\]/, newInclude);
}

export default async function setupRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/setup — 현재 설비 정보 추출 */
  app.get('/api/setup', async (_req, reply) => {
    const configPath = ENV.VECTOR_CONFIG_PATH;
    if (!existsSync(configPath)) {
      return reply.status(404).send({ error: 'Config file not found' });
    }

    const content = readFileSync(configPath, 'utf-8');
    const [sinkIp, sinkPort] = getSinkAddr(content);

    const fields: SetupFields = {
      equipment_id: getMeta(content, 'equipment_id'),
      equipment_type: getMeta(content, 'equipment_type'),
      ip: getHeartbeatTag(content, 'ip'),
      line_code: getMeta(content, 'line_code'),
      log_type: getMeta(content, 'log_type'),
      include_paths: getInclude(content),
      sink_address: sinkIp,
      sink_port: sinkPort,
    };
    return reply.send(fields);
  });

  /** PUT /api/setup — 설비 정보를 TOML에 반영 */
  app.put<{ Body: Partial<SetupFields> }>('/api/setup', async (req, reply) => {
    const configPath = ENV.VECTOR_CONFIG_PATH;
    if (!existsSync(configPath)) {
      return reply.status(404).send({ error: 'Config file not found' });
    }

    let content = readFileSync(configPath, 'utf-8');
    const fields = req.body;

    /* .bak 백업 */
    copyFileSync(configPath, configPath + '.bak');

    /* add_metadata VRL source + heartbeat tags 동시 반영 */
    const metaKeys = ['equipment_id', 'equipment_type', 'line_code', 'log_type'] as const;
    for (const key of metaKeys) {
      if (fields[key] !== undefined) {
        content = setMeta(content, key, fields[key]!);
        content = setHeartbeatTag(content, key, fields[key]!);
      }
    }

    /* ip는 heartbeat tags에만 */
    if (fields.ip !== undefined) {
      content = setHeartbeatTag(content, 'ip', fields.ip);
    }

    /* include 경로 */
    if (fields.include_paths !== undefined) {
      content = setInclude(content, fields.include_paths);
    }

    /* sink address */
    if (fields.sink_address !== undefined || fields.sink_port !== undefined) {
      const [curIp, curPort] = getSinkAddr(content);
      content = setSinkAddr(
        content,
        fields.sink_address ?? curIp,
        fields.sink_port ?? curPort,
      );
    }

    writeFileSync(configPath, content, 'utf-8');
    return reply.send({ success: true, message: '설비 정보가 TOML에 반영되었습니다.' });
  });
}
