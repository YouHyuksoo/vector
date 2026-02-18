/**
 * @file src/server/plugins/error-handler.ts
 * @description 전역 에러 핸들러 플러그인
 *
 * 초보자 가이드:
 * 1. **주요 개념**: 모든 라우트에서 발생하는 에러를 일관된 형식으로 응답
 * 2. **동작**: 500 에러는 상세 내용 숨김, 4xx 에러는 메시지 노출
 */

import { FastifyPluginAsync, FastifyError } from 'fastify';
import { logger } from '../../utils/logger.js';

export const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    logger.error(
      { err: error, url: request.url, method: request.method },
      'Request error',
    );

    const statusCode = error.statusCode ?? 500;

    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      statusCode,
      timestamp: new Date().toISOString(),
    });
  });
};
