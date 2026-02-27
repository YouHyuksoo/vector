# 서버 환경설정

## Aggregator TOML 설정

Aggregator는 모든 설비에서 보내는 로그를 수신하는 서버 컴포넌트입니다.

### 기본 구성

```toml
data_dir = "/data/vector"

[api]
enabled = true
address = "0.0.0.0:8686"
```

| 항목 | 설명 | 기본값 |
|------|------|--------|
| `data_dir` | 데이터 저장 디렉토리 | `/data/vector` |
| `api.address` | Vector API 바인드 주소 | `0.0.0.0:8686` |

### 수신(Source) 설정

```toml
[sources.agent_log]
type = "vector"
address = "0.0.0.0:9000"
```

- `address`: Agent가 접속할 IP:포트
- 방화벽에서 해당 포트가 열려 있어야 합니다

### API 전송(Sink) 설정

```toml
[sinks.api_sink]
type = "http"
inputs = ["transform_*"]
uri = "http://localhost:3100/api/logs/ingest"
encoding.codec = "json"
batch.max_events = 10
batch.timeout_secs = 5
```

## Oracle DB 설정

**설정** 페이지에서 아래 항목을 구성합니다:

| 항목 | 설명 | 예시 |
|------|------|------|
| HOST | DB 서버 IP | `192.168.1.100` |
| PORT | 리스너 포트 | `1521` |
| SID | 데이터베이스 SID | `ORCL` |
| USER | 접속 계정 | `log_user` |
| PASSWORD | 비밀번호 | `****` |

## Fastify 서버 설정

| 항목 | 설명 | 기본값 |
|------|------|--------|
| HOST | 바인드 IP | `0.0.0.0` |
| PORT | HTTP 포트 | `3100` |
| LOG_LEVEL | 로그 레벨 | `info` |

## Redis 설정

큐 처리를 위한 Redis 연결 설정:

| 항목 | 설명 | 기본값 |
|------|------|--------|
| HOST | Redis 서버 IP | `127.0.0.1` |
| PORT | Redis 포트 | `6379` |
| PASSWORD | 인증 비밀번호 | (없음) |
