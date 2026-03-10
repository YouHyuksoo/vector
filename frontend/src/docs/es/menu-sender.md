# Configuracion del Transmisor

## Resumen

Cree y gestione configuraciones TOML de Agent para instalar en cada PC de equipo.
Configure rutas de log, informacion de conexion al servidor y metadatos por equipo.

## Prerrequisitos

- El servidor Fastify debe estar en ejecucion

## Diseno de Pantalla

### Izquierda: Lista de Equipos

Todos los equipos registrados se muestran como una lista.

#### Agregar Equipo

1. Haga clic en el boton **Agregar**
2. Ingrese un nombre de equipo (solo letras mayusculas, numeros y guiones)
   - Ejemplos: `AOI-LINE01`, `SP-001`, `REFLOW-A`
3. Haga clic en confirmar para crear una plantilla TOML por defecto

#### Eliminar Equipo

1. Seleccione el equipo a eliminar
2. Haga clic en el boton **Eliminar**
3. Haga clic en **Confirmar** en el popup

> La eliminacion es permanente y no se puede deshacer. Sea precavido.

### Derecha: Editor de Configuracion Agent

Seleccione un equipo para editar su configuracion TOML.

#### Informacion del Equipo

| Elemento | Descripcion | Ejemplo |
|----------|-------------|---------|
| Tipo de Equipo | Categoria del equipo | SP, SPI, AOI, REFLOW, etc. |
| Tipo de Log | Clasificacion de log | INSPECTION, ALARM, etc. |
| Codigo de Linea | Identificador de linea de produccion | LINE-01, L1 |
| ID de Equipo | ID unico del equipo | AOI-001, SP-A01 |

#### Configuracion de Conexion

| Elemento | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| IP del Servidor | Direccion del servidor Aggregator | `192.168.1.10` |
| Puerto | Puerto de recepcion del Aggregator | `9000` |
| Modo de Lectura | `end` (solo nuevos) / `beginning` (todos) | `end` |
| Expiracion de Archivo | Ignorar archivos antiguos (segundos) | `86400` (24h) |
| Timeout | Timeout de lectura (ms) | `1000` |
| Buffer | Tamano del buffer de envio (MB) | `256` |

#### Rutas de Log

Ingrese las rutas de archivos de log a monitorear, una por linea.

- Patrones glob soportados: `C:/logs/*.csv`, `D:/data/**/*.log`
- Funcionan rutas tanto de Windows como Unix
- Separe multiples rutas con saltos de linea

#### Edicion TOML Directa

Active **Editar TOML directamente** para editar el contenido TOML completo directamente.

### Guardar Configuracion

Haga clic en **Guardar** para almacenar el archivo TOML en el servidor.

### Descargar Configuracion

Haga clic en **Descargar** para descargar el archivo TOML a su PC local.
Copie el archivo descargado al PC del equipo.
