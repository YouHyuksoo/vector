# Server Configuration

## Aggregator TOML Config

The Aggregator is the server component that receives logs from all equipment.

### Basic Configuration

```toml
data_dir = "/data/vector"

[api]
enabled = true
address = "0.0.0.0:8686"
```

| Item | Description | Default |
|------|-------------|---------|
| `data_dir` | Data storage directory | `/data/vector` |
| `api.address` | Vector API bind address | `0.0.0.0:8686` |

### Source Configuration

```toml
[sources.agent_log]
type = "vector"
address = "0.0.0.0:9000"
```

- `address`: IP:port for Agent connections
- Ensure the port is open in the firewall

### API Sink Configuration

```toml
[sinks.api_sink]
type = "http"
inputs = ["transform_*"]
uri = "http://localhost:3100/api/logs/ingest"
encoding.codec = "json"
batch.max_events = 10
batch.timeout_secs = 5
```

## Oracle DB Settings

Configure the following items on the **Settings** page:

| Item | Description | Example |
|------|-------------|---------|
| HOST | DB server IP | `192.168.1.100` |
| PORT | Listener port | `1521` |
| SID | Database SID | `ORCL` |
| USER | Connection account | `log_user` |
| PASSWORD | Password | `****` |

## Fastify Server Settings

| Item | Description | Default |
|------|-------------|---------|
| HOST | Bind IP | `0.0.0.0` |
| PORT | HTTP port | `3100` |
| LOG_LEVEL | Log level | `info` |

## Redis Settings

Redis connection settings for queue processing:

| Item | Description | Default |
|------|-------------|---------|
| HOST | Redis server IP | `127.0.0.1` |
| PORT | Redis port | `6379` |
| PASSWORD | Auth password | (none) |
