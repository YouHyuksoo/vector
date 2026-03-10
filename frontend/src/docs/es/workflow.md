# Flujo de Trabajo

## Resumen del Flujo de Datos

```
Archivos de Log del Equipo → Agent(Vector) → Aggregator(Vector) → API Fastify → Oracle DB
```

## Proceso Paso a Paso

### Paso 1: Recolección de Logs (Agent)

El Vector Agent instalado en cada PC de equipo monitorea los archivos de log.

- **file source**: Lee archivos de log en la ruta especificada en modo tail
- Detecta nuevas líneas en tiempo real
- Adjunta automáticamente metadatos (tipo de equipo, código de línea, ID de equipo)

### Paso 2: Transmisión de Logs (Agent → Aggregator)

El Agent envía los logs recolectados al servidor Aggregator.

- **vector sink**: Usa el protocolo nativo TCP de Vector
- Reintento automático y buffering en caso de fallos de red
- Transmisión por lotes para eficiencia de red

### Paso 3: Análisis de Logs (Aggregator)

El Aggregator analiza los logs usando VRL (Vector Remap Language).

- Aplica código de análisis VRL por tipo de equipo
- Soporta formatos CSV, longitud fija, clave-valor y otros
- Convierte resultados analizados en campos JSON estructurados

### Paso 4: Entrega API (Aggregator → Fastify)

Entrega datos analizados al servidor Fastify mediante API HTTP.

- Transmisión por lotes codificada en JSON
- Reintento con retroceso exponencial en caso de fallo

### Paso 5: Almacenamiento en BD (Fastify → Oracle)

El servidor Fastify almacena datos en Oracle DB.

- **Modo TABLE**: INSERT directo en tablas
- **Modo PROCEDURE**: Ejecutar procedimientos almacenados para lógica de negocio
- Procesamiento asíncrono mediante colas BullMQ para fiabilidad

## Puntos de Monitoreo

| Ubicación | Qué Verificar |
|-----------|---------------|
| Dashboard | Estado de infraestructura (Servidor, Redis, Oracle, Vector) |
| Estado de Cola | Conteos de Espera/Activo/Completado/Fallido |
| Recolectores de Equipos | Heartbeat del Agent y estado en línea |
| Log de Errores | Logs de fallos de almacenamiento |
