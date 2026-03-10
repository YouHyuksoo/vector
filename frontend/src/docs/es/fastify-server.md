# Servidor Fastify

## Resumen

Fastify es el servidor **hub central** de este sistema (puerto 3100).
Recibe logs recolectados de los equipos, los almacena en Oracle DB y proporciona todas las APIs de gestión de configuración y monitoreo.

## Arquitectura

```
PC de Equipo (Vector Agent)
    ↓ Transmisión de logs
Servidor (Vector Aggregator)
    ↓ Entrega HTTP
Servidor Fastify (puerto 3100)  ← Este servidor
    ├── Cola BullMQ (Redis)
    │     ↓ Procesamiento asíncrono
    │   Almacenamiento Oracle DB
    ├── Gestión de configuración (TOML, JSON)
    ├── Simulación VRL
    ├── Integración AI
    └── API de Monitoreo → Frontend Next.js
```

## Secuencia de Arranque

El servidor se inicializa en el siguiente orden al arrancar:

1. **Pool de conexiones Oracle** — mín 4, máx 20 conexiones
2. **Instancia Fastify** — registrar rutas, cargar plugins
3. **Worker BullMQ** — worker de cola basado en Redis
4. **Handlers de apagado graceful** — SIGINT/SIGTERM
5. **Iniciar listener HTTP** — puerto 3100

## Funcionalidades Principales

### 1. Ingesta de Logs y Carga en Cola

Cuando el Vector Aggregator envía logs analizados vía HTTP, Fastify los recibe y los encola.

```
POST /api/logs
```

| Paso | Descripción |
|------|-------------|
| Validación | Validar lote de logs con esquema Zod |
| Carga en cola | Carga asíncrona a cola BullMQ (respuesta 202 inmediata) |
| Prioridad | Logs ALARM → prioridad 1 (máxima), otros → 5 |
| Reintento | 3 reintentos en caso de fallo (retroceso exponencial: 1s → 2s → 4s) |

### 2. Worker de Cola: Almacenamiento en BD

El worker BullMQ extrae logs de la cola y los almacena en Oracle DB.

**Modo TABLE**:
- Genera automáticamente SQL INSERT desde el mapeo `table-registry.json`
- Soporta inserción masiva vía `executeMany`
- Permite fallos parciales (`batchErrors: true`)

**Modo PROCEDURE**:
- **NAMED**: Llamada por nombre de parámetro (`BEGIN PKG.PROC(:P1, :P2); END;`)
- **ARRAY**: Pasar arrays de tipo Oracle Collection

**En caso de fallo**:
- Registra detalles del error en tabla `LOG_ERROR`
- BullMQ maneja reintentos automáticos
- Después del máximo de reintentos, el trabajo queda en estado Fallido

### 3. Heartbeat y Estado de Equipos

```
POST /api/heartbeat
```

| Elemento | Descripción |
|----------|-------------|
| Recibir | Los Agents de equipos envían heartbeats periódicos |
| Almacenar | Redis `SETEX` con TTL (por defecto 60 segundos) |
| Decisión | TTL expirado = fuera de línea, existe = en línea |
| Consulta | `GET /api/status` para estado de todos los equipos |

### 4. API de Monitoreo Unificada

```
GET /api/monitor/overview
```

Devuelve el estado completo del sistema en una sola llamada:

| Elemento | Contenido |
|----------|-----------|
| `server` | Tiempo de actividad, entorno (development/production) |
| `redis` | Estado de conexión |
| `vector` | En ejecución, PID, API accesible, versión |
| `queue` | Conteos Espera/Activo/Completado/Fallido |
| `equipments` | Lista de equipos en línea/fuera de línea |
| `tables` | Lista de tablas Oracle registradas |
| `recentErrors` | Errores recientes |

### 5. Gestión del Proceso Vector

| Endpoint | Acción |
|----------|--------|
| `GET /api/monitor/vector` | Consultar estado de Vector (PID, versión, uptime) |
| `POST /api/monitor/vector/start` | Iniciar motor Vector (`spawn` + detached) |
| `POST /api/monitor/vector/stop` | Detener motor Vector (`taskkill`) |

Verifica estado mediante la API de Vector (`/health`) y GraphQL.

### 6. Gestión de Configuración TOML

#### Aggregator (Receptor)

| Endpoint | Acción |
|----------|--------|
| `GET /api/monitor/aggregator/config` | Leer configuración TOML actual |
| `PUT /api/monitor/aggregator/config` | Guardar (se crea respaldo automático) |
| `GET /api/monitor/aggregator/backups` | Listar historial de respaldos |
| `POST /api/monitor/aggregator/backups/:name/restore` | Restaurar respaldo |

- Respaldos basados en marca de tiempo, máximo 20 retenidos
- Respaldos más antiguos se eliminan automáticamente al exceder el límite

#### Agent (Transmisor)

| Endpoint | Acción |
|----------|--------|
| `GET /api/monitor/agent/configs` | Lista de todos los equipos |
| `POST /api/monitor/agent/configs` | Crear nuevo equipo (plantilla por defecto) |
| `GET /api/monitor/agent/config/:name` | Leer TOML de equipo específico |
| `PUT /api/monitor/agent/config/:name` | Guardar (respaldo .bak) |
| `DELETE /api/monitor/agent/config/:name` | Eliminar |
| `GET /api/monitor/agent/config/:name/download` | Descargar TOML |

### 7. Gestión de Mapeo de Tablas/Procedimientos

La información de mapeo se almacena en JSON local (`config/table-registry.json`).

| Endpoint | Acción |
|----------|--------|
| `GET /api/monitor/tables/oracle/all` | Consultar todas las tablas Oracle |
| `GET /api/monitor/tables/oracle/:name/columns` | Metadatos de columnas de tabla |
| `POST /api/monitor/registry` | Guardar mapeo de columnas de tabla |
| `GET /api/monitor/procedures/oracle/all` | Consultar todos los procedimientos Oracle |
| `POST /api/monitor/procedures` | Guardar mapeo de procedimiento |

El worker referencia este registro para generar dinámicamente SQL INSERT o llamadas a PROCEDURE.
Los esquemas se cachean por 5 minutos.

### 8. Simulador VRL

| Endpoint | Acción |
|----------|--------|
| `GET /api/monitor/vrl/code/:equipmentType` | Obtener código VRL existente |
| `POST /api/monitor/vrl/simulate` | Probar ejecución de código VRL |
| `POST /api/monitor/vrl/apply` | Aplicar VRL al TOML + sincronizar reglas de análisis |

**Flujo de simulación**:
1. Crear archivos temporales (JSON de entrada + programa VRL)
2. Ejecutar `vector vrl --input ... --program ... --print-object`
3. Extraer JSON de stdout → analizar campos `.data.*`
4. Devolver resultados

**Flujo de aplicación TOML**:
1. Encontrar bloque `[transforms.parse_logs]` en aggregator.toml
2. Reemplazar el bloque `if .equipment_type == "TYPE" { ... }`
3. Rastrear profundidad de llaves para detección precisa de límites de bloque
4. Guardar TOML (respaldo primero) + sincronizar JSON de reglas de análisis

### 9. Generación de Código VRL con AI

| Endpoint | Acción |
|----------|--------|
| `GET /api/monitor/ai/config` | Obtener configuración AI (claves API enmascaradas) |
| `PUT /api/monitor/ai/config` | Guardar configuración AI |
| `POST /api/monitor/ai/test` | Probar conectividad API |
| `POST /api/monitor/ai/generate-vrl` | Auto-generar código VRL |

**Modelos AI Soportados**:

| Proveedor | Modelos |
|-----------|---------|
| Google Gemini | gemini-2.5-flash, etc. |
| Mistral AI | mistral-large-latest, etc. |
| Anthropic Claude | claude-sonnet-4, etc. |

Envía log de muestra + tipo de equipo + instrucciones del usuario para auto-generar código de análisis VRL.

### 10. Configuración del Sistema (Variables de Entorno)

```
GET /api/monitor/config  — Consultar configuración actual
PUT /api/monitor/config  — Actualizar archivo .env
```

| Grupo | Claves de Configuración |
|-------|------------------------|
| Servidor | HOST, PORT, NODE_ENV |
| Oracle | USER, PASSWORD, CONNECT_STRING, POOL_MIN, POOL_MAX |
| Redis | HOST, PORT, PASSWORD |
| Cola | CONCURRENCY, BATCH_SIZE, BATCH_TIMEOUT_MS |
| Almacenamiento | RAW_LOG_BASE_PATH |
| Heartbeat | TTL_SECONDS |

- Las contraseñas se enmascaran en las respuestas
- Los cambios en claves Oracle/Redis requieren reinicio del servidor
- `updateEnvValue()` también actualiza valores en memoria inmediatamente

### 11. Descargas de Archivos

| Endpoint | Acción |
|----------|--------|
| `GET /api/monitor/download/vector-zip` | Ejecutable Vector (vector.zip) |
| `GET /api/monitor/download/agent/:name` | TOML del Agent por equipo |

### 12. Registro de Errores

| Endpoint | Acción |
|----------|--------|
| `DELETE /api/monitor/errors` | Eliminar todo de tabla LOG_ERROR |

El worker de cola registra automáticamente errores en `LOG_ERROR` cuando falla el almacenamiento en BD.

## Apagado Graceful

El servidor se apaga de forma segura en este orden:

1. **Fastify** — Dejar de aceptar nuevas solicitudes
2. **Workers/colas BullMQ** — Esperar trabajos en progreso, luego cerrar
3. **Pool de conexiones Oracle** — Devolver conexiones, cerrar pool
4. **Conexión Redis** — Cerrar

> Responde a señales SIGINT (Ctrl+C) o SIGTERM.

## Stack Tecnológico

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Fastify | 5.x | Framework de servidor HTTP |
| oracledb | 6.x | Driver de Oracle DB |
| BullMQ | 5.x | Cola de trabajos basada en Redis |
| ioredis | 5.x | Cliente Redis |
| Zod | 3.x | Validación de esquemas en runtime |
| Pino | 9.x | Logging estructurado |
| dotenv | 16.x | Gestión de variables de entorno |
