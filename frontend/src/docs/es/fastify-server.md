# Servidor Fastify

Fastify es la API operativa entre Vector Aggregator, Oracle y el dashboard.

Al iniciar valida `.env`, abre el pool Oracle Thin, registra rutas, escucha en el puerto 3110 e intenta iniciar Aggregator si es necesario.

`POST /api/logs` acepta un registro, un array o `{ "logs": [...] }` hasta 1.000 registros. Valida, guarda el raw, comprueba exclusión del equipo, ejecuta TABLE INSERT o PROCEDURE CALL, registra JSONL y responde `202 Accepted`.

Ubicaciones principales: `C:\data\raw-logs`, `data/process-logs`, `data/equipment-registry.json`, `data/heartbeat-snapshot.json` y `config/table-registry.json`.
