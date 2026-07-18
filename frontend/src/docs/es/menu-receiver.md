# Configuración del Receptor

Gestione el TOML de Vector Aggregator y su historial de respaldos.

El formulario incluye API/datos, entrada Vector 6000, Fluent 24224, sink Fastify `http://127.0.0.1:3110/api/logs`, batch, concurrencia, buffer de disco y opciones de destino/fecha.

Use **VRL y Mapeo** para parsing por equipo. Fastify guarda actualmente los raw bajo `RAW_LOG_BASE_PATH`.

Guardar crea un respaldo. Puede previsualizar o restaurar y después recargar Vector.
