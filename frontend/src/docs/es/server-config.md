# Configuración del Servidor

| Archivo | Uso |
|---|---|
| `.env` | Fastify, Oracle, almacenamiento y heartbeat |
| `vector-config/aggregator/vector-aggregator.toml` | Entradas, VRL, HTTP sink y buffer de disco |
| `config/table-registry.json` | Mapeo TABLE/PROCEDURE Oracle |
| `config/parse-fields.json` | Campos `data.*` de VRL |

Puertos: dashboard 3100, Fastify 3110, entrada Vector 6000, Fluent 24224, API Aggregator 8687 y Agent Manager 9090.

La configuración activa incluye servidor, Oracle, pool, ruta raw, TTL heartbeat y puerto de Agent Manager. Redis y cola no forman parte del runtime actual.
