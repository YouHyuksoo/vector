# Durability and Recovery

The current system does not use Redis or BullMQ. Durability is provided by the Vector HTTP disk buffer, raw files, and JSONL processing logs.

| Failure | Protection | Recovery |
|---|---|---|
| Backend or Oracle delay | Vector `to_api` disk buffer | Automatic resend after recovery |
| Oracle operation failure | ERROR record with `raw_data` | Retry from System Logs |
| Original data needed | `C:\data\raw-logs` | Preview or manual ingest |
| Server restart | Heartbeat snapshot and equipment registry | Restored from disk |

Watch Active, Rotation Wait, and Orphan buffer together with source/sink throughput in Operations Diagnostics.
