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

## Gestión desde el Panel de Administración

1. Seleccione el equipo en la página **Transmisor**
2. Ingrese información del equipo (tipo, código de línea, ID)
3. Configure rutas de log y conexión al servidor
4. Guarde, luego descargue la configuración desde la página **Descarga de Agent**
