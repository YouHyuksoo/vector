# Configuracion del Sistema

## Resumen

Gestione la configuracion a nivel de sistema para servidor, base de datos, Redis, colas y mas.
La seccion inferior contiene configuracion de modelos AI para configurar la AI usada en el Simulador VRL.

## Prerrequisitos

- El servidor Fastify debe estar en ejecucion
- Algunas configuraciones requieren reinicio del servidor despues de cambios

## Como Usar

### Ver Configuracion

Al entrar a la pagina, la configuracion actual del sistema se muestra en 6 secciones.

### Editar Configuracion

1. Haga clic en **Editar** para entrar en modo de edicion
2. Modifique valores para cada elemento
3. Haga clic en **Guardar** para guardar cambios
4. Haga clic en **Cancelar** para descartar cambios

### Secciones de Configuracion

#### Servidor

| Elemento | Descripcion | Ejemplo |
|----------|-------------|---------|
| HOST | IP de enlace del servidor | `0.0.0.0` |
| PORT | Puerto HTTP | `3100` |
| NODE_ENV | Entorno de ejecucion | `production` |

> Cambiar el puerto del servidor requiere un reinicio.

#### Oracle

| Elemento | Descripcion | Ejemplo |
|----------|-------------|---------|
| HOST | IP del servidor DB | `192.168.1.100` |
| PORT | Puerto del listener | `1521` |
| SID | SID de la base de datos | `ORCL` |
| USER | Cuenta de conexion | `log_user` |
| PASSWORD | Contrasena | `****` |
| POOL_MIN | Pool de conexiones minimo | `2` |
| POOL_MAX | Pool de conexiones maximo | `10` |

> Cambiar la informacion de conexion Oracle requiere un reinicio.

#### Redis

| Elemento | Descripcion | Ejemplo |
|----------|-------------|---------|
| HOST | IP del servidor Redis | `127.0.0.1` |
| PORT | Puerto de Redis | `6379` |
| PASSWORD | Contrasena de autenticacion | (puede estar vacio) |

#### Cola

| Elemento | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| CONCURRENCY | Workers concurrentes | `5` |
| BATCH_SIZE | Tamano de lote | `10` |
| BATCH_TIMEOUT_MS | Timeout de lote (ms) | `5000` |

#### Almacenamiento

| Elemento | Descripcion | Ejemplo |
|----------|-------------|---------|
| RAW_LOG_BASE_PATH | Ruta de almacenamiento de logs raw | `/data/raw` |

#### Heartbeat

| Elemento | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| TTL_SECONDS | Expiracion de heartbeat del Agent (segundos) | `60` |

> Los Agents se muestran como fuera de linea cuando no se recibe heartbeat dentro de este tiempo.

## Configuracion de Modelos AI

Configure modelos AI usados para generacion de codigo VRL en el Simulador VRL.

### Modelos Soportados

| Proveedor | Modelos |
|-----------|---------|
| **Google Gemini** | 2.5 Flash, 2.5 Pro, 2.0 Flash, 2.0 Flash-Lite |
| **Mistral AI** | Large, Small, Codestral, Nemo |
| **Anthropic Claude** | Sonnet 4, Haiku 4.5, Opus 4 |

### Pasos de Configuracion

1. Ingrese la **clave API** del proveedor AI
2. Seleccione el **modelo** a usar
3. Active **Habilitar**
4. Haga clic en **Probar** para verificar conectividad API
   - Exito: Se muestra el tiempo de respuesta (ms)
   - Fallo: Se muestra el mensaje de error

> La clave API debe ingresarse antes de que funcione el toggle de habilitacion.
> Los modelos habilitados estaran disponibles en la funcion de generacion AI del Simulador VRL.
