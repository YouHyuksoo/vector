# Flujo de Trabajo

```text
Archivo de log del equipo
  → Vector Agent o Fluent Bit
  → Vector Aggregator (parsing VRL)
  → POST /api/logs
  → validación Fastify, almacenamiento raw e ingesta directa en Oracle
```

Vector Agent envía al puerto 6000 y Fluent Bit al 24224. Aggregator procesa por `equipment_type`, asigna TABLE o PROCEDURE y protege eventos pendientes con buffer de disco.

Fastify valida, guarda el original en `C:\data\raw-logs`, registra etapas en `data/process-logs/*.jsonl` y ejecuta Oracle directamente. No existe cola Redis ni worker separado.
