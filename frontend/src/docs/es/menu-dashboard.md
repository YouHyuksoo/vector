# Dashboard

## Resumen

La pantalla principal de monitoreo que proporciona una vista general del estado completo del sistema.
Los datos se actualizan automáticamente cada 5 segundos para monitoreo de infraestructura en tiempo real.

## Prerrequisitos

- El servidor Fastify (puerto 3100) debe estar en ejecución
- Redis y Oracle DB deben estar conectados para una visualización correcta del estado

## Diseño de Pantalla

### Tarjeta de Estado de Infraestructura

Muestra el estado de los 4 componentes principales del sistema.

| Elemento | Indicador | Estado Normal |
|----------|-----------|---------------|
| **Servidor** | Tiempo de actividad del servidor Fastify | Verde "activo" |
| **Redis** | Estado de conexión | Verde "conectado" |
| **Oracle** | Cantidad de tablas registradas | Verde "N tablas" |
| **Vector** | Estado del motor de recolección | Verde "ok" |

- El elemento Vector tiene botones **Iniciar/Detener** para controlar directamente el motor de recolección

### Monitoreo de Recursos del Servidor

El uso de recursos de hardware se muestra como barras de progreso debajo de la tarjeta de estado de infraestructura.

| Elemento | Indicador | Advertencia |
|----------|-----------|-------------|
| **CPU** | % de uso, cantidad de núcleos | Rojo al 90%+ |
| **Memoria** | Usada / Total (GB) | Mensaje de advertencia al 90%+ |
| **Disco** | Usado / Total (GB) | Mensaje de advertencia al 90%+ |

- Menor al 70%: **Verde** (Normal)
- 70% ~ 90%: **Amarillo** (Precaución)
- 90% o más: **Rojo** + mensaje de advertencia intermitente
- Se actualiza automáticamente cada 5 segundos

### Estado de Cola

Muestra el estado de procesamiento de la cola de trabajos BullMQ.

- **Espera**: Cantidad de logs no procesados
- **Activo**: Almacenándose actualmente en Oracle DB
- **Completado**: Cantidad procesada exitosamente
- **Fallido**: Cantidad con fallo de almacenamiento (consulte la página de Errores para detalles)

### Tablas Registradas

Muestra la lista de tablas de almacenamiento de logs en Oracle DB con la cantidad de columnas de cada una.

### Recolectores de Equipos

Muestra el estado en línea/fuera de línea de los Agents instalados en cada PC de equipo.

- **Punto verde**: En línea (recibiendo heartbeats)
- **Punto gris**: Fuera de línea (sin heartbeat)
- Cada tarjeta muestra tipo de equipo, código de línea, ID de equipo y última vez visto
- La sección superior muestra estadísticas de total/en línea/fuera de línea
