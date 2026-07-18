# Workflow

```text
Equipment log file
  → Vector Agent or Fluent Bit
  → Vector Aggregator (VRL parsing)
  → POST /api/logs
  → Fastify validation, raw-file storage, and direct Oracle ingestion
```

Vector Agents send to port 6000 and Fluent Bit sends to 24224. The Aggregator parses by `equipment_type`, assigns a TABLE or PROCEDURE target, and protects pending events with its HTTP disk buffer.

Fastify validates the request, saves the original under `C:\data\raw-logs`, writes processing stages to `data/process-logs/*.jsonl`, and performs the Oracle operation directly. There is no Redis queue or separate worker.

For an incident, check Operations Diagnostics, Equipment Dashboard, System Logs, and finally the Raw Log Files screen.
