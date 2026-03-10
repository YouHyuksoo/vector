# Configuración del Servidor

## Configuración TOML del Aggregator

El Aggregator es el componente del servidor que recibe logs de todos los equipos.

### Configuración Básica

```toml
data_dir = "/data/vector"

[api]
enabled = true
address = "0.0.0.0:8686"
```

| Elemento | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `data_dir` | Directorio de almacenamiento de datos | `/data/vector` |
| `api.address` | Dirección de enlace de la API de Vector | `0.0.0.0:8686` |

### Configuración de Fuente

```toml
[sources.agent_log]
type = "vector"
address = "0.0.0.0:9000"
```

- `address`: IP:puerto para conexiones de Agent
- Asegúrese de que el puerto esté abierto en el firewall

### Configuración del Sink API

```toml
[sinks.api_sink]
type = "http"
inputs = ["transform_*"]
uri = "http://localhost:3100/api/logs/ingest"
encoding.codec = "json"
batch.max_events = 10
batch.timeout_secs = 5
```

## Configuración de Oracle DB

Configure los siguientes elementos en la página de **Configuración**:

| Elemento | Descripción | Ejemplo |
|----------|-------------|---------|
| HOST | IP del servidor DB | `192.168.1.100` |
| PORT | Puerto del listener | `1521` |
| SID | SID de la base de datos | `ORCL` |
| USER | Cuenta de conexión | `log_user` |
| PASSWORD | Contraseña | `****` |

## Configuración del Servidor Fastify

| Elemento | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| HOST | IP de enlace | `0.0.0.0` |
| PORT | Puerto HTTP | `3100` |
| LOG_LEVEL | Nivel de log | `info` |

## Configuración de Redis

Configuración de conexión Redis para procesamiento de colas:

| Elemento | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| HOST | IP del servidor Redis | `127.0.0.1` |
| PORT | Puerto de Redis | `6379` |
| PASSWORD | Contraseña de autenticación | (ninguna) |
