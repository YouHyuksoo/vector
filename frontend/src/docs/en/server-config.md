# Server Configuration

| File | Purpose |
|---|---|
| `.env` | Fastify, Oracle, storage, and heartbeat settings |
| `vector-config/aggregator/vector-aggregator.toml` | Inputs, VRL, HTTP sink, and disk buffer |
| `config/table-registry.json` | Oracle TABLE/PROCEDURE mapping |
| `config/parse-fields.json` | VRL `data.*` fields |

Ports: dashboard 3100, Fastify 3110, Vector input 6000, Fluent input 24224, Aggregator API 8687, and Agent Manager 9090.

The active `.env` keys cover server, Oracle, pool sizing, raw-log path, heartbeat TTL, and Agent Manager port. Redis and queue settings are not part of the current runtime.
