# Fastify Server

## Overview

Fastify is the **central hub** server of this system (port 3100).
It receives logs collected from equipment, stores them in Oracle DB, and provides all configuration management and monitoring APIs.

## Architecture

```
Equipment PC (Vector Agent)
    ↓ Log transmission
Server (Vector Aggregator)
    ↓ HTTP delivery
Fastify Server (port 3100)  ← This server
    ├── BullMQ Queue (Redis)
    │     ↓ Async processing
    │   Oracle DB storage
    ├── Config management (TOML, JSON)
    ├── VRL simulation
    ├── AI integration
    └── Monitoring API → Next.js frontend
```

## Bootstrap Sequence

The server initializes in the following order on startup:

1. **Oracle connection pool** — min 4, max 20 connections
2. **Fastify instance** — register routes, load plugins
3. **BullMQ Worker** — Redis-based queue worker
4. **Graceful shutdown handlers** — SIGINT/SIGTERM
5. **Start HTTP listener** — port 3100

## Core Features

### 1. Log Ingestion & Queue Loading

When the Vector Aggregator sends parsed logs via HTTP, Fastify receives and queues them.

```
POST /api/logs
```

| Step | Description |
|------|-------------|
| Validation | Validate log batch with Zod schema |
| Queue loading | Async load to BullMQ queue (immediate 202 response) |
| Priority | ALARM logs → priority 1 (highest), others → 5 |
| Retry | 3 retries on failure (exponential backoff: 1s → 2s → 4s) |

### 2. Queue Worker: DB Storage

The BullMQ worker pulls logs from the queue and stores them in Oracle DB.

**TABLE mode**:
- Auto-generates INSERT SQL from `table-registry.json` mapping
- Supports bulk insert via `executeMany`
- Allows partial failures (`batchErrors: true`)

**PROCEDURE mode**:
- **NAMED**: Call by parameter name (`BEGIN PKG.PROC(:P1, :P2); END;`)
- **ARRAY**: Pass Oracle Collection type arrays

**On failure**:
- Records error details in `LOG_ERROR` table
- BullMQ handles automatic retry
- After max retries, job stays in Failed state

### 3. Heartbeat & Equipment Status

```
POST /api/heartbeat
```

| Item | Description |
|------|-------------|
| Receive | Equipment Agents send periodic heartbeats |
| Store | Redis `SETEX` with TTL (default 60 seconds) |
| Decision | TTL expired = offline, exists = online |
| Query | `GET /api/status` for all equipment status |

### 4. Unified Monitoring API

```
GET /api/monitor/overview
```

Returns entire system status in a single call:

| Item | Content |
|------|---------|
| `server` | Uptime, environment (development/production) |
| `redis` | Connection status |
| `vector` | Running, PID, API reachable, version |
| `queue` | Wait/Active/Done/Fail counts |
| `equipments` | Equipment online/offline list |
| `tables` | Registered Oracle table list |
| `recentErrors` | Recent errors |

### 5. Vector Process Management

| Endpoint | Action |
|----------|--------|
| `GET /api/monitor/vector` | Query Vector status (PID, version, uptime) |
| `POST /api/monitor/vector/start` | Start Vector engine (`spawn` + detached) |
| `POST /api/monitor/vector/stop` | Stop Vector engine (`taskkill`) |

Checks status via Vector API (`/health`) and GraphQL.

### 6. TOML Configuration Management

#### Aggregator (Receiver)

| Endpoint | Action |
|----------|--------|
| `GET /api/monitor/aggregator/config` | Read current TOML config |
| `PUT /api/monitor/aggregator/config` | Save (auto-backup created) |
| `GET /api/monitor/aggregator/backups` | List backup history |
| `POST /api/monitor/aggregator/backups/:name/restore` | Restore backup |

- Timestamp-based backups, max 20 retained
- Oldest backups auto-deleted when exceeded

#### Agent (Sender)

| Endpoint | Action |
|----------|--------|
| `GET /api/monitor/agent/configs` | All equipment list |
| `POST /api/monitor/agent/configs` | Create new equipment (default template) |
| `GET /api/monitor/agent/config/:name` | Read specific equipment TOML |
| `PUT /api/monitor/agent/config/:name` | Save (.bak backup) |
| `DELETE /api/monitor/agent/config/:name` | Delete |
| `GET /api/monitor/agent/config/:name/download` | Download TOML |

### 7. Table/Procedure Mapping Management

Mapping info is stored in local JSON (`config/table-registry.json`).

| Endpoint | Action |
|----------|--------|
| `GET /api/monitor/tables/oracle/all` | Query all Oracle tables |
| `GET /api/monitor/tables/oracle/:name/columns` | Table column metadata |
| `POST /api/monitor/registry` | Save table column mapping |
| `GET /api/monitor/procedures/oracle/all` | Query all Oracle procedures |
| `POST /api/monitor/procedures` | Save procedure mapping |

The worker references this registry to dynamically generate INSERT SQL or PROCEDURE calls.
Schemas are cached for 5 minutes.

### 8. VRL Simulator

| Endpoint | Action |
|----------|--------|
| `GET /api/monitor/vrl/code/:equipmentType` | Get existing VRL code |
| `POST /api/monitor/vrl/simulate` | Test VRL code execution |
| `POST /api/monitor/vrl/apply` | Apply VRL to TOML + sync parse rules |

**Simulation flow**:
1. Create temp files (input JSON + VRL program)
2. Execute `vector vrl --input ... --program ... --print-object`
3. Extract JSON from stdout → parse `.data.*` fields
4. Return results

**TOML apply flow**:
1. Find `[transforms.parse_logs]` block in aggregator.toml
2. Replace the `if .equipment_type == "TYPE" { ... }` block
3. Track brace depth for precise block boundary detection
4. Save TOML (backup first) + sync parse rules JSON

### 9. AI VRL Code Generation

| Endpoint | Action |
|----------|--------|
| `GET /api/monitor/ai/config` | Get AI config (API keys masked) |
| `PUT /api/monitor/ai/config` | Save AI config |
| `POST /api/monitor/ai/test` | Test API connectivity |
| `POST /api/monitor/ai/generate-vrl` | Auto-generate VRL code |

**Supported AI Models**:

| Provider | Models |
|----------|--------|
| Google Gemini | gemini-2.5-flash, etc. |
| Mistral AI | mistral-large-latest, etc. |
| Anthropic Claude | claude-sonnet-4, etc. |

Sends sample log + equipment type + user instructions to auto-generate VRL parsing code.

### 10. System Settings (Environment Variables)

```
GET /api/monitor/config  — Query current settings
PUT /api/monitor/config  — Update .env file
```

| Group | Setting Keys |
|-------|-------------|
| Server | HOST, PORT, NODE_ENV |
| Oracle | USER, PASSWORD, CONNECT_STRING, POOL_MIN, POOL_MAX |
| Redis | HOST, PORT, PASSWORD |
| Queue | CONCURRENCY, BATCH_SIZE, BATCH_TIMEOUT_MS |
| Storage | RAW_LOG_BASE_PATH |
| Heartbeat | TTL_SECONDS |

- Passwords are masked in responses
- Oracle/Redis key changes require server restart
- `updateEnvValue()` also updates values in memory immediately

### 11. File Downloads

| Endpoint | Action |
|----------|--------|
| `GET /api/monitor/download/vector-zip` | Vector executable (vector.zip) |
| `GET /api/monitor/download/agent/:name` | Per-equipment Agent TOML |

### 12. Error Logging

| Endpoint | Action |
|----------|--------|
| `DELETE /api/monitor/errors` | Delete all from LOG_ERROR table |

The queue worker automatically records errors to `LOG_ERROR` when DB storage fails.

## Graceful Shutdown

The server shuts down safely in this order:

1. **Fastify** — Stop accepting new requests
2. **BullMQ workers/queues** — Wait for in-progress jobs, then close
3. **Oracle connection pool** — Return connections, close pool
4. **Redis connection** — Close

> Responds to SIGINT (Ctrl+C) or SIGTERM signals.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Fastify | 5.x | HTTP server framework |
| oracledb | 6.x | Oracle DB driver |
| BullMQ | 5.x | Redis-based job queue |
| ioredis | 5.x | Redis client |
| Zod | 3.x | Runtime schema validation |
| Pino | 9.x | Structured logging |
| dotenv | 16.x | Environment variable management |
