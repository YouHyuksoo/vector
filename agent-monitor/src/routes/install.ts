/**
 * @file agent-monitor/src/routes/install.ts
 * @description Vector 바이너리 다운로드/설치 API
 *
 * 초보자 가이드:
 * 1. GET /api/install/status  - Vector 설치 여부 확인 (바이너리 + 설정 파일 존재)
 * 2. POST /api/install        - 마스터 서버에서 vector.exe 다운로드 + 기본 TOML 생성
 * 3. 다운로드 URL: MASTER_SERVER_URL/api/monitor/agent-download/vector
 */

import { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, writeFileSync, createWriteStream } from 'fs';
import { dirname } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { ENV } from '../server.js';

/** 기본 TOML 템플릿 (초기 설치용) */
const DEFAULT_TOML = `# ── Vector Agent 설정 ──
# 이 파일은 Agent Manager가 자동 생성했습니다.
# 설정 탭의 폼 모드에서 설비 정보를 입력하세요.

data_dir = "C:\\\\vector\\\\data"

[api]
enabled = true
address = "0.0.0.0:8686"

# ── [로그 수집] 파일 감시 ──
[sources.work_logs]
type = "file"
include = [
  "C:\\\\logs\\\\*.log",
]

# ── [메타데이터 추가] 설비 정보 삽입 ──
[transforms.add_metadata]
type = "remap"
inputs = ["work_logs"]
source = """
.equipment_type = "UNKNOWN"
.equipment_id = "UNKNOWN"
.line_code = "LINE-01"
.log_type = "INSPECTION"
"""

# ── [하트비트] 주기적 상태 전송 (30초 간격) ──
[sources.heartbeat]
type = "static_metrics"
interval_secs = 30
namespace = "agent"

[[sources.heartbeat.metrics]]
name = "heartbeat"
kind = "absolute"

[sources.heartbeat.metrics.value.gauge]
value = 1

[sources.heartbeat.metrics.tags]
equipment_type = "UNKNOWN"
equipment_id = "UNKNOWN"
line_code = "LINE-01"
log_type = "INSPECTION"
ip = ""

# ── [전송] Aggregator로 전송 ──
[sinks.to_aggregator]
type = "vector"
inputs = ["add_metadata", "heartbeat"]
address = "20.10.30.112:9000"
`;

export default async function installRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/install/status — 설치 상태 확인 */
  app.get('/api/install/status', async (_req, reply) => {
    const binaryExists = existsSync(ENV.VECTOR_BIN_PATH);
    const configExists = existsSync(ENV.VECTOR_CONFIG_PATH);
    return reply.send({
      installed: binaryExists && configExists,
      binaryExists,
      configExists,
      binaryPath: ENV.VECTOR_BIN_PATH,
      configPath: ENV.VECTOR_CONFIG_PATH,
    });
  });

  /** POST /api/install — Vector 다운로드 + 기본 TOML 생성 */
  app.post('/api/install', async (_req, reply) => {
    try {
      /* 디렉토리 생성 */
      const binDir = dirname(ENV.VECTOR_BIN_PATH);
      const configDir = dirname(ENV.VECTOR_CONFIG_PATH);
      if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });
      if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

      /* 마스터 서버에서 vector.exe 다운로드 */
      const downloadUrl = `${ENV.MASTER_SERVER_URL}/api/monitor/agent-download/vector`;
      const res = await fetch(downloadUrl);
      if (!res.ok || !res.body) {
        return reply.status(502).send({
          success: false,
          error: `다운로드 실패: HTTP ${res.status}`,
        });
      }

      const ws = createWriteStream(ENV.VECTOR_BIN_PATH);
      await pipeline(Readable.fromWeb(res.body as any), ws);

      /* 기본 TOML 생성 (이미 있으면 건드리지 않음) */
      if (!existsSync(ENV.VECTOR_CONFIG_PATH)) {
        writeFileSync(ENV.VECTOR_CONFIG_PATH, DEFAULT_TOML, 'utf-8');
      }

      /* data 디렉토리 생성 */
      const dataDir = 'C:\\vector\\data';
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

      return reply.send({
        success: true,
        message: 'Vector가 설치되었습니다. 설정 탭에서 설비 정보를 입력하세요.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: message });
    }
  });
}
