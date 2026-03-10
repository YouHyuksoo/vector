# Solución de Problemas

## Errores Comunes

### Agent No Se Conecta al Servidor

**Síntoma**: El Agent no aparece en la lista de recolectores de equipos

**Lista de verificación**:
1. Verifique que el servidor Aggregator esté en ejecución
2. Compruebe que el `address` del TOML del Agent tenga la IP:puerto correcta del servidor
3. Asegúrese de que el firewall permita el puerto (por defecto 9000)
4. Pruebe la conectividad de red: `ping {IP del servidor}`

**Solución**:
```bash
# Probar conectividad de puerto
telnet 192.168.1.10 9000
```

### Logs No Se Recolectan

**Síntoma**: El Agent está en línea pero no llegan datos

**Lista de verificación**:
1. Verifique que la ruta `include` del TOML coincida con la ubicación real del archivo de log
2. Compruebe que el archivo de log fue modificado dentro del período `ignore_older_secs`
3. Asegúrese de que el proceso Vector tenga permisos de lectura para el archivo

### Fallo de Conexión a Oracle DB

**Síntoma**: El estado de Oracle muestra "down" en el dashboard

**Lista de verificación**:
1. Verifique la configuración de conexión Oracle en la página de **Configuración**
2. Compruebe el estado del listener Oracle: `lsnrctl status`
3. Verifique que el SID/nombre de servicio sea correcto
4. Compruebe si la contraseña de la cuenta ha expirado

### Trabajos Fallidos Acumulándose en la Cola

**Síntoma**: El conteo "Fallido" aumenta en el estado de la cola

**Lista de verificación**:
1. Compruebe mensajes de error detallados en la página de **Errores**
2. Verifique que la estructura de la tabla Oracle coincida con el mapeo
3. Asegúrese de que los campos requeridos no estén ausentes

## Métodos de Depuración

### Verificar Logs de Vector

```bash
# Ejecutar en modo detallado
vector.exe --config config.toml --verbose

# Ver logs solo de componentes específicos
VECTOR_LOG=debug vector.exe --config config.toml
```

### Verificar Logs del Servidor API

Monitoree logs en tiempo real en la consola del servidor Fastify.

### Verificar Estado de Cola Redis

```bash
redis-cli
> KEYS bull:*
> LLEN bull:log-queue:wait
```

## Ajuste de Rendimiento

| Elemento | Recomendado | Descripción |
|----------|-------------|-------------|
| `batch.max_events` | 10–50 | Tamaño de lote API |
| `batch.timeout_secs` | 5–10 | Intervalo de lote |
| `buffer.max_events` | 500 | Tamaño del buffer en memoria |
| Concurrencia BullMQ | 5 | Concurrencia de cola |
