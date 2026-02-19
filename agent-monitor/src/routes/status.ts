/**
 * @file agent-monitor/src/routes/status.ts
 * @description Vector Agent 상태 및 전송 메트릭 조회 API 라우트
 *
 * 초보자 가이드:
 * 1. 이 파일은 Vector Agent의 실행 상태(health, PID, uptime, version)를 조회합니다
 * 2. GraphQL API를 통해 Vector 내부 메트릭(이벤트 수, 에러 수 등)을 조회합니다
 * 3. GET /api/status  - Vector 실행 상태 반환
 * 4. GET /api/metrics - 전송 메트릭 (events_in/out, errors, 컴포넌트 목록) 반환
 * 5. Vector의 GraphQL API (기본 http://127.0.0.1:8686/graphql)에 POST 요청을 보냅니다
 */

import { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { ENV } from '../server.js';

/* ─── 타입 정의 ─── */

/** Vector 실행 상태 */
interface VectorStatus {
  running: boolean;
  pid: number | null;
  apiReachable: boolean;
  uptime: string | null;
  version: string | null;
}

/** 전송 메트릭 */
interface TransferMetrics {
  eventsIn: number;
  eventsOut: number;
  errors: number;
  bufferUsedBytes: number;
  bufferMaxBytes: number;
  bufferPercent: number;
  components: { sources: string[]; sinks: string[] };
}

/* ─── 헬퍼 함수 ─── */

/**
 * Vector GraphQL API에 쿼리를 전송합니다
 * @param query - GraphQL 쿼리 문자열
 * @returns 쿼리 결과 또는 null (실패 시)
 */
async function queryVectorGraphQL<T>(query: string): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${ENV.VECTOR_API_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/**
 * 초(seconds)를 사람이 읽기 쉬운 형태로 변환합니다
 * @param seconds - 업타임 초
 * @returns "3h 12m" 같은 문자열
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Vector health 엔드포인트에 접근하여 실행 여부를 확인합니다
 * @returns true이면 Vector가 응답 가능
 */
async function checkHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${ENV.VECTOR_API_URL}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Vector 프로세스의 PID를 찾습니다 (Windows tasklist) */
function findVectorPid(): number | null {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq vector.exe" /FO CSV /NH', {
      encoding: 'utf-8', timeout: 3000,
    });
    const m = out.match(/"vector\.exe","(\d+)"/i);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

/* ─── 라우트 플러그인 ─── */

/** Fastify 플러그인: Vector 상태/메트릭 라우트 등록 */
export default async function statusRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/status - Vector 실행 상태 조회 */
  app.get('/api/status', async (_req, reply) => {
    const apiReachable = await checkHealth();
    const pid = findVectorPid();

    let uptime: string | null = null;
    let version: string | null = null;

    if (apiReachable) {
      const meta = await queryVectorGraphQL<{
        meta: { uptime: number; versionString: string };
      }>('{ meta { uptime versionString } }');

      if (meta?.meta) {
        uptime = formatUptime(meta.meta.uptime);
        version = meta.meta.versionString;
      }
    }

    const status: VectorStatus = {
      running: apiReachable || pid !== null,
      pid,
      apiReachable,
      uptime,
      version,
    };

    return reply.send(status);
  });

  /** GET /api/metrics - 전송 메트릭 조회 */
  app.get('/api/metrics', async (_req, reply) => {
    const METRICS_QUERY = `{
      sources {
        edges {
          node {
            componentId
            metrics { receivedEventsTotal { receivedEventsTotal } }
          }
        }
      }
      sinks {
        edges {
          node {
            componentId
            metrics {
              sentEventsTotal { sentEventsTotal }
              componentErrorsTotal { componentErrorsTotal }
            }
          }
        }
      }
    }`;

    type SourceNode = { componentId: string; metrics: { receivedEventsTotal: { receivedEventsTotal: number } } };
    type SinkNode = { componentId: string; metrics: { sentEventsTotal: { sentEventsTotal: number }; componentErrorsTotal: { componentErrorsTotal: number } } };
    type GqlMetrics = { sources: { edges: { node: SourceNode }[] }; sinks: { edges: { node: SinkNode }[] } };

    const data = await queryVectorGraphQL<GqlMetrics>(METRICS_QUERY);

    if (!data) {
      const empty: TransferMetrics = {
        eventsIn: 0, eventsOut: 0, errors: 0,
        bufferUsedBytes: 0, bufferMaxBytes: 0, bufferPercent: 0,
        components: { sources: [], sinks: [] },
      };
      return reply.send(empty);
    }

    const sourceNames = data.sources.edges.map((e) => e.node.componentId);
    const sinkNames = data.sinks.edges.map((e) => e.node.componentId);

    const eventsIn = data.sources.edges.reduce(
      (sum, e) => sum + (e.node.metrics.receivedEventsTotal?.receivedEventsTotal ?? 0), 0,
    );
    const eventsOut = data.sinks.edges.reduce(
      (sum, e) => sum + (e.node.metrics.sentEventsTotal?.sentEventsTotal ?? 0), 0,
    );
    const errors = data.sinks.edges.reduce(
      (sum, e) => sum + (e.node.metrics.componentErrorsTotal?.componentErrorsTotal ?? 0), 0,
    );

    const metrics: TransferMetrics = {
      eventsIn, eventsOut, errors,
      bufferUsedBytes: 0,
      bufferMaxBytes: 0,
      bufferPercent: 0,
      components: { sources: sourceNames, sinks: sinkNames },
    };

    return reply.send(metrics);
  });
}
