# Fastify Server

Fastify is the operational API between the Vector Aggregator, Oracle, and the dashboard.

At startup it validates `.env`, opens the Oracle Thin pool, registers routes, starts on port 3110, and tries to start the Aggregator when needed.

`POST /api/logs` accepts one record, an array, or `{ "logs": [...] }` up to 1,000 records. It validates, stores the raw file, checks equipment exclusion, performs TABLE INSERT or PROCEDURE CALL, records JSONL processing logs, and returns `202 Accepted`.

Key locations are `C:\data\raw-logs`, `data/process-logs`, `data/equipment-registry.json`, `data/heartbeat-snapshot.json`, and `config/table-registry.json`.
