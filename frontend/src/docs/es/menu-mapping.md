# Mapeo de Destino

## Resumen

Configure como los datos de log recolectados de los equipos se almacenan en Oracle DB.
Mapee cada campo del log recolectado a columnas de tablas Oracle o parametros de procedimientos.

## Prerrequisitos

- Oracle DB debe estar conectado
- Las **tablas** o **procedimientos** de destino deben existir previamente en Oracle
- Para mapeo por tipo de log, las reglas de analisis del **Simulador VRL** deben estar configuradas primero

## Como Usar

### Paso 1: Seleccionar Tipo de Destino

Elija uno de dos modos en la parte superior:

- **Tabla**: INSERT directo en tablas Oracle
- **Procedimiento**: CALL a procedimientos/paquetes Oracle

### Paso 2: Seleccionar Destino (Panel Izquierdo)

**Modo tabla**:
- Muestra la lista de tablas Oracle
- Use el filtro de busqueda para encontrar la tabla deseada
- Haga clic en una tabla para mostrar sus columnas a la derecha

**Modo procedimiento**:
- Muestra la lista de procedimientos/paquetes Oracle
- El icono de paquete distingue paquetes de procedimientos independientes
- Haga clic en un procedimiento para mostrar sus parametros a la derecha

### Paso 3: Seleccionar Tipo de Equipo

Seleccione el tipo de equipo (tipo de log) para el mapeo.

- **Analizado** (verde): El analisis VRL esta configurado — seleccione campos fuente del desplegable
- **No analizado** (punteado): VRL aun no configurado — no se puede seleccionar

> Si no se selecciona tipo de equipo, los campos fuente deben ingresarse como texto manualmente.

### Paso 4: Mapear Campos Fuente

#### Modo Tabla

| Columna | Descripcion |
|---------|-------------|
| Nombre de Columna | Nombre de columna de la tabla Oracle |
| Tipo | Tipo de dato (VARCHAR2, NUMBER, etc.) |
| Nullable | Si se permite NULL |
| Campo Fuente | Seleccione o ingrese el campo de log a mapear |
| Requerido | Si es requerido para almacenamiento (S/N) |

- **Con tipo de equipo**: Seleccione campos analizados del desplegable
- **Sin tipo de equipo**: Ingrese manualmente en campo de texto (ej., `log.field_name`)
- Las columnas mapeadas muestran una marca verde (✓) a la izquierda

#### Modo Procedimiento

| Columna | Descripcion |
|---------|-------------|
| Orden | Orden del parametro |
| Argumento | Nombre del parametro del procedimiento Oracle |
| Tipo | Tipo de dato |
| Direccion | IN / OUT / IN OUT |
| Campo Fuente | Campo de log a mapear |
| Requerido | Si es requerido |

**Modo de Llamada**:
- **NAMED**: Llamada por nombre de parametro — llamada estandar a procedimiento
- **ARRAY**: Pasar como array — requiere nombre de tipo Oracle Collection

### Paso 5: Mapeo Automatico (Opcional)

Haga clic en el boton **Mapeo Auto** para hacer coincidir automaticamente columnas con campos fuente que tengan nombres coincidentes.

- Ejemplo: Columna Oracle `INSPECTOR` → Campo fuente `data.INSPECTOR` coincide automaticamente
- Puede ajustar manualmente despues del mapeo automatico

### Paso 6: Guardar

Haga clic en **Guardar Mapeo** para guardar la configuracion.

## Editor de Reglas de Analisis

Haga clic en el boton **Editar Reglas de Analisis** en la pantalla de mapeo para abrir el modal.

### Sincronizacion VRL

- Haga clic en **Sincronizar VRL** para auto-extraer campos `.data.*` del codigo VRL de aggregator.toml
- Los campos extraidos se reflejan en la lista desplegable
- Los campos disponibles varian por tipo de equipo

### Adicion Manual de Campos

- Ingrese un nombre de campo y haga clic en **Agregar**
- El prefijo `data.` se agrega automaticamente
- Los campos innecesarios se pueden eliminar
