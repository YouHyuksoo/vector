# Redis

## ¿Qué es Redis?

Redis es un **almacén de datos en memoria ultrarrápido**.
Almacena datos en RAM en lugar de disco, haciendo que las lecturas y escrituras sean extremadamente rápidas.

En este sistema, Redis no se usa para almacenamiento permanente de datos como Oracle.
En su lugar, maneja **dos tareas que necesitan procesamiento temporal rápido**.

## Rol 1: Cola de Trabajos (BullMQ)

### ¿Por Qué una Cola?

Si miles de logs llegan a la vez, insertarlos directamente en Oracle podría causar sobrecarga.
En su lugar, creamos una **cola** en Redis y los procesamos en orden.

```
Llegada masiva de logs
    ↓
Apilar en cola Redis (respuesta inmediata — "aceptado")
    ↓
El worker procesa 5 a la vez
    ↓
Almacenar en Oracle
```

### Estado de la Cola

La tarjeta **Estado de Cola** en el dashboard muestra este estado de la cola Redis.

| Estado | Significado |
|--------|-------------|
| **Espera** | Trabajos apilados en cola, aún no procesados |
| **Activo** | El worker está almacenando en Oracle actualmente |
| **Completado** | Almacenado exitosamente en Oracle |
| **Fallido** | Falló después de 3 intentos de reintento |

### Prioridad

- **Logs ALARM** → Prioridad 1 (procesados primero)
- **Logs normales** → Prioridad 5

### Reintento

En caso de fallo de almacenamiento, el sistema reintenta automáticamente 3 veces (intervalos 1s → 2s → 4s).
Si los 3 fallan, el trabajo se mantiene en estado **Fallido** y puede verificarse en la página de **Errores**.

## Rol 2: Heartbeat de Equipos (Detección En Línea/Fuera de Línea)

### Cómo Funciona

```
Agent del Equipo → "Estoy vivo" (heartbeat) → Guardado en Redis con temporizador de 60 segundos
                                                ↓
                                    Llega de nuevo en 60s → Temporizador reiniciado (permanece en línea)
                                    No llega en 60s → Auto-eliminado = Fuera de línea
```

### ¿Por Qué Redis?

- Los heartbeats llegan de docenas de equipos **cada pocos segundos**
- Almacenar esto en Oracle sería demasiado lento
- Redis procesa en memoria con **latencia de milisegundos**
- La función TTL (Time To Live) auto-elimina entradas expiradas — no se necesita código de limpieza

### Integración con Dashboard

La tarjeta **Recolectores de Equipos** en el dashboard lee estos datos de Redis.

| Indicador | Significado |
|-----------|-------------|
| Punto verde | Heartbeat existe en Redis → En línea |
| Punto gris | TTL expirado y eliminado → Fuera de línea |

## Comparación Oracle vs Redis

| | Oracle | Redis |
|---|--------|-------|
| **Almacenamiento** | Disco duro | RAM (memoria) |
| **Velocidad** | Relativamente lento | Ultrarrápido (milisegundos) |
| **Vida útil de datos** | Permanente | Temporal (eliminado al expirar TTL) |
| **Propósito** | Datos de log, configuración de mapeo | Cola de trabajos, estado en tiempo real |
| **Al reiniciar servidor** | Datos persisten | Datos perdidos (cola puede recuperarse tras reinicio) |

## Configuración

Gestione la configuración de conexión Redis en la página de **Configuración**.

| Elemento | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| HOST | IP del servidor Redis | `127.0.0.1` |
| PORT | Puerto de Redis | `6379` |
| PASSWORD | Contraseña de autenticación | (ninguna) |

## Impacto de Fallos

| Situación | Impacto |
|-----------|---------|
| Redis caído | No se pueden encolar logs, no se pueden almacenar heartbeats, estado del dashboard no disponible |
| Reinicio de Redis | Logs no procesados en cola pueden perderse, todos los heartbeats se reinician (muestra temporal fuera de línea) |
| Oracle caído | Logs siguen apilándose en cola pero no se pueden almacenar (Redis actúa como buffer) |

> Dado que la caída de Redis afecta a todo el sistema, su operación estable es crítica.
