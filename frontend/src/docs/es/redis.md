# Durabilidad y Recuperación

El sistema actual no usa Redis ni BullMQ. La durabilidad depende del buffer de disco HTTP de Vector, archivos raw y logs JSONL de procesamiento.

| Falla | Protección | Recuperación |
|---|---|---|
| Retraso de Backend u Oracle | Buffer `to_api` de Vector | Reenvío automático |
| Error Oracle | Registro ERROR con `raw_data` | Reintento desde Logs del Sistema |
| Se necesita el original | `C:\data\raw-logs` | Vista previa o ingesta manual |
| Reinicio del servidor | Snapshot heartbeat y registro de equipos | Restauración desde disco |

Observe Active, Rotation Wait y Orphan junto con el rendimiento de source/sink en Diagnóstico.
