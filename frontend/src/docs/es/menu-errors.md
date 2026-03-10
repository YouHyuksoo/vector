# Log de Errores

## Resumen

Una pagina que agrega y muestra errores ocurridos durante el almacenamiento de logs.
Se actualiza automaticamente cada 5 segundos para monitoreo de errores en tiempo real.

## Prerrequisitos

- El servidor Fastify debe estar en ejecucion
- Oracle DB debe estar conectado

## Diseno de Pantalla

### Tabla de Errores

Cada entrada de error muestra la siguiente informacion:

| Columna | Descripcion |
|---------|-------------|
| **Hora** | Marca de tiempo de ocurrencia del error |
| **Tabla** | Nombre de la tabla Oracle de destino |
| **Equipo** | ID del equipo que causo el error |
| **Mensaje** | Descripcion detallada del error |

### Eliminar Todo

1. Haga clic en el boton **Eliminar Todo** en la parte superior
2. Haga clic en **Confirmar** en el popup de confirmacion
3. Todos los logs de error se eliminan y se muestra el conteo

> Los errores eliminados no se pueden recuperar. Registre los detalles del error primero si es necesario.

## Tipos de Error Comunes

| Mensaje de Error | Causa | Solucion |
|------------------|-------|----------|
| ORA-00942: table or view does not exist | Tabla de destino no existe | Verificar tabla en Mapeo de Destino |
| ORA-01400: cannot insert NULL | Columna requerida sin valor | Verificar SOURCE_FIELD en mapeo |
| ORA-12899: value too large | Datos exceden tamano de columna | Ajustar tamano de columna Oracle |
| Connection refused | Fallo de conexion a BD | Verificar estado del servidor Oracle |
