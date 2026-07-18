# 서버 환경설정

## 구성 파일

| 파일 | 용도 |
|---|---|
| `.env` | Fastify, Oracle, 저장소, 하트비트 설정 |
| `vector-config/aggregator/vector-aggregator.toml` | 중앙 수신, VRL, HTTP sink와 disk buffer |
| `config/table-registry.json` | Oracle TABLE/PROCEDURE 매핑 |
| `config/parse-fields.json` | VRL에서 추출된 `data.*` 필드 |

## 주요 포트

| 포트 | 용도 |
|---:|---|
| 3100 | 웹 대시보드 |
| 3110 | Fastify API |
| 6000 | Vector Agent 수신 |
| 24224 | Fluent Bit 수신 |
| 8687 | Aggregator 관리 API |
| 9090 | 설비 PC Agent Manager |

## `.env` 주요 항목

- `HOST`, `PORT`, `NODE_ENV`
- `ORACLE_CONNECT_STRING`, `ORACLE_USER`, `ORACLE_PASSWORD`
- `ORACLE_POOL_MIN`, `ORACLE_POOL_MAX`
- `RAW_LOG_BASE_PATH`
- `HEARTBEAT_TTL_SECONDS`
- `AGENT_MONITOR_PORT`

Redis/큐 설정은 현재 런타임에서 사용하지 않습니다. 웹의 **시스템 설정** 화면은 서버, Oracle, 저장소, 하트비트 항목을 관리합니다.
