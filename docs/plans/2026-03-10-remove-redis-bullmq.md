# Redis/BullMQ 제거 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redis와 BullMQ를 제거하고 직접 Oracle INSERT + 인메모리 하트비트로 대체

**Architecture:** 큐 → 직접 INSERT, Redis SETEX → Map+setTimeout TTL, 프론트엔드에서 redis/queue UI 제거

**Tech Stack:** Node.js, Fastify, Oracle, Next.js

---

### Task 1: 인메모리 하트비트 서비스 작성
- 삭제: `src/redis/heartbeat.service.ts`
- 삭제: `src/redis/redis.client.ts`
- 생성: `src/services/heartbeat.service.ts` (Map 기반)

### Task 2: 로그 직접 INSERT 서비스 작성
- 삭제: `src/queue/producers/log.producer.ts`
- 삭제: `src/queue/workers/log-insert.worker.ts`
- 삭제: `src/queue/queue.manager.ts`
- 수정: `src/services/log-ingest.service.ts`

### Task 3: 라우트 수정
- 수정: `src/server/routes/log-ingest.route.ts`
- 수정: `src/server/routes/heartbeat.route.ts`
- 수정: `src/server/routes/status.route.ts`
- 수정: `src/server/routes/monitor.route.ts`

### Task 4: 부트스트랩/설정 정리
- 수정: `src/index.ts`
- 수정: `src/utils/graceful-shutdown.ts`
- 수정: `src/config/constants.ts`
- 수정: `src/config/env.ts`
- 수정: `.env`, `.env.example`

### Task 5: 프론트엔드 정리
- 삭제: `QueueStats.tsx`
- 수정: `api.ts`, `InfraStatusCard.tsx`, `ServiceFlowDiagram.tsx`
- 수정: `dashboard/page.tsx`, `settings/page.tsx`, `errors/page.tsx`

### Task 6: 의존성 제거 및 빌드 확인
- `npm uninstall bullmq ioredis`
- `npm run build` (백엔드 tsc)
- 프론트엔드 빌드
