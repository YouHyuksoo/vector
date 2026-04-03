/**
 * @file src/server/plugins/health.ts
 * @description 서버 헬스체크 엔드포인트
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 로드밸런서, 모니터링 시스템이 서버 상태를 확인하는 용도
 * 2. **사용 방법**: GET /health → { status: 'ok', uptime, timestamp }
 */

import { FastifyPluginAsync } from 'fastify';
import { localISOString } from '../../utils/logger.js';

export const healthPlugin: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: localISOString(),
      uptime: process.uptime(),
    });
  });
};
