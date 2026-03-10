# Configuración del Agent

## Resumen

El Agent es un componente instalado en cada PC de equipo que recolecta archivos de log y los envía al servidor Aggregator.

## Estructura de Configuración TOML

```toml
data_dir = "./data"

[sources.file_log]
type = "file"
include = ["C:/logs/*.csv"]
read_from = "end"
ignore_older_secs = 86400

[transforms.add_meta]
type = "remap"
inputs = ["file_log"]
source = '''
  .equip_type = "AOI"
  .line_code = "LINE-01"
  .equip_id = "AOI-001"
'''

[sinks.to_aggregator]
type = "vector"
inputs = ["add_meta"]
address = "192.168.1.10:9000"
```

## Configuraciones Clave

### Fuente (Recolección de Logs)

| Elemento | Descripción | Ejemplo |
|----------|-------------|---------|
| `include` | Rutas de archivos de log a monitorear | `["C:/logs/*.csv"]` |
| `read_from` | Posición de inicio de lectura | `end` (solo nuevos) / `beginning` (todos) |
| `ignore_older_secs` | Ignorar archivos antiguos (segundos) | `86400` (24 horas) |

### Transform (Metadatos)

| Elemento | Descripción |
|----------|-------------|
| `equip_type` | Tipo de equipo (SP, SPI, AOI, etc.) |
| `line_code` | Código de línea |
| `equip_id` | ID único del equipo |

### Sink (Transmisión al Servidor)

| Elemento | Descripción |
|----------|-------------|
| `address` | IP:puerto del servidor Aggregator |

## Configuración por Equipo

Edite mediante la interfaz gráfica en la página **Transmisor**, o use el modo de edición TOML directa.

### Ejemplos de Rutas de Log

| Tipo de Equipo | Patrón de Ruta |
|----------------|---------------|
| SP | `C:/SP_DATA/results/*.csv` |
| SPI | `D:/SPI/inspection/*.log` |
| AOI | `C:/AOI/output/*.dat` |
| REFLOW | `C:/REFLOW/temp/*.csv` |

## Metodos de Configuracion

### Metodo 1: Agent Manager (Configurar directamente en PC del equipo)

Ejecute `agent-manager.exe` en el PC del equipo para configurar mediante la interfaz web local (`http://localhost:9090`).

1. **Pestana Config → Modo formulario**: Ingrese ID del equipo, tipo, IP, codigo de linea, tipo de log, ruta de log, direccion/puerto del Aggregator
2. **Pestana Config → Modo edicion TOML**: Edite directamente el TOML
3. Despues de guardar, reinicie Vector desde la **Pestana Gestion**

Guardar en modo formulario sincroniza automaticamente `add_metadata` VRL source y `heartbeat.metrics.tags` en el TOML.

### Metodo 2: Panel de Administracion (Servidor maestro)

1. Seleccione el equipo en la pagina **Transmisor**
2. Ingrese informacion del equipo (tipo, codigo de linea, ID)
3. Configure rutas de log y conexion al servidor
4. Guarde, luego descargue la configuracion desde la pagina **Descarga de Agent**
