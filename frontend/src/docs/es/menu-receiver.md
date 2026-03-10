# Configuracion del Receptor

## Resumen

Edite la configuracion TOML del Aggregator (servidor de recoleccion) que se ejecuta en el servidor.
El Aggregator recibe logs de todos los Agents de equipos, los analiza con VRL y los reenvia al servidor API.

## Prerrequisitos

- El servidor Fastify debe estar en ejecucion
- El archivo `config/aggregator.toml` debe existir en el servidor

## Diseno de Pantalla

### Izquierda: Editor de Configuracion

#### Configuracion Basica

| Elemento | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| Directorio de Datos | Ruta de almacenamiento de datos internos de Vector | `/data/vector` |
| IP API de Vector | IP de enlace de la API de gestion de Vector | `0.0.0.0` |
| Puerto API | Puerto de la API de gestion de Vector | `8686` |

#### Fuente de Agent

| Elemento | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| IP de Escucha | IP para aceptar conexiones de Agent | `0.0.0.0` |
| Puerto de Escucha | Puerto de conexion de Agent | `9000` |

> Este puerto debe estar abierto en el firewall para que los Agents se conecten.

#### Almacenamiento de Archivos Raw

Configuracion para guardar logs raw recolectados en archivos.

| Elemento | Descripcion |
|----------|-------------|
| Patron de Ruta | Almacenamiento auto-categorizado por tipo de equipo (ej., `/data/raw/{{ equipment_type }}/...`) |
| Tamano de Buffer | Buffer de escritura de archivo (MB) |

#### Enrutamiento de Destino

Seleccione el metodo de almacenamiento de datos por tipo de equipo.

- **TABLE INSERT**: INSERT directo en tablas Oracle (por defecto)
- **PROCEDURE CALL**: Llamar procedimientos Oracle para almacenamiento

Cada tipo de equipo puede configurarse independientemente.
Formato de nombre de destino por defecto: `LOG_{equipment_type}`.

#### Sink API

| Elemento | Descripcion | Valor por defecto |
|----------|-------------|-------------------|
| URI API | Endpoint del servidor Fastify | `http://localhost:3100/api/logs/ingest` |
| Tamano de Lote | Eventos por lote | `10` |
| Intervalo de Lote | Timeout de lote (segundos) | `5s` |
| Tamano de Buffer | Buffer de envio (MB) | - |
| Retroceso Inicial | Tiempo de espera del primer reintento | `1s` |
| Duracion Maxima | Espera maxima de reintento | `10s` |

#### Edicion TOML Directa

Active **Editar TOML directamente** para editar el archivo de configuracion completo como texto plano.

> Tenga cuidado con la sintaxis TOML al editar directamente.

### Derecha: Historial de Cambios

Los respaldos se crean automaticamente cada vez que cambia el archivo de configuracion.

#### Lista de Respaldos

Cada respaldo muestra:
- **Fecha**: Hora de creacion del respaldo
- **Fuente**: Origen del cambio (editor, vrl-apply, restore)
- **Tamano**: Tamano del archivo

#### Vista Previa

Haga clic en **Vista Previa** para ver el contenido del archivo de configuracion en ese momento.

#### Restaurar

1. Haga clic en el boton **Restaurar** en el respaldo deseado
2. Haga clic en **Confirmar** en el popup
3. La configuracion actual se reemplaza con el respaldo seleccionado (la configuracion actual se respalda automaticamente primero)

### Guardar y Aplicar

1. Haga clic en **Guardar** despues de editar
2. Aparece un modal de "Reiniciar Vector"
3. **Reiniciar**: Aplicar cambios inmediatamente (reinicia el motor Vector)
4. **Mas Tarde**: Solo guardar configuracion, reiniciar manualmente despues
