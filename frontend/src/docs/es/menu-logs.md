# Visor de Logs

## Resumen

Una pagina para visualizar datos de log almacenados en Oracle DB, organizados por tabla.
Se usa para verificar que los datos recolectados se almacenan correctamente.

## Prerrequisitos

- Oracle DB debe estar conectado
- Debe existir al menos una tabla de logs en Oracle
- El **Mapeo de Destino** debe estar configurado para que los datos se almacenen

## Como Usar

### Paso 1: Seleccionar una Tabla

Elija la tabla a visualizar desde el desplegable en la parte superior.

- Todas las tablas de logs en Oracle DB se muestran en la lista
- Las tablas con prefijo `LOG_` son tablas de log generadas automaticamente

### Paso 2: Establecer Limite de Filas

- Por defecto: **50 filas**
- Maximo: **500 filas**
- Ingrese un numero directamente para cambiar el limite

### Paso 3: Ver Datos

Los datos se muestran inmediatamente despues de seleccionar una tabla.

- Todas las columnas se muestran en una tabla con desplazamiento horizontal
- Los valores de texto largos se truncan automaticamente
- El conteo de filas se muestra en la parte inferior

### Actualizar

Haga clic en el boton **Recargar** para obtener los datos mas recientes.

## Consejos

- Util para verificar que los datos se almacenan correctamente despues de cambios de configuracion
- Cuando aparecen trabajos fallidos en la pagina de Errores, consulte esta pagina para ver los ultimos datos almacenados exitosamente
