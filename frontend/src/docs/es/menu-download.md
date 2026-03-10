# Descarga de Agent

## Resumen

Descargue el motor Vector y los archivos de configuracion TOML por equipo para instalacion en PCs de equipos.

## Prerrequisitos

- El servidor Fastify debe estar en ejecucion
- `vector.zip` debe estar disponible en la ruta de descarga del servidor
- El equipo debe estar registrado en **Configuracion del Transmisor** para descargar archivos de configuracion

## Diseno de Pantalla

### 1. Ejecutable Vector

Haga clic en **Descargar vector.zip** para descargar el archivo del motor Vector.

- Tamano del archivo: ~40MB
- Extraiga en el PC del equipo antes de usar
- Archivos incluidos: `bin/vector.exe`, `start-vector.bat`, `stop-vector.bat`, `install-service.bat`, `uninstall-service.bat`

### 2. Agent Manager

Haga clic en **Descargar agent-manager.exe** para descargar la herramienta de gestion integral para PC de equipos.

- Tamano del archivo: ~45MB
- Ejecutable independiente — no requiere instalacion de Node.js
- Ejecute `agent-manager.exe` en el PC del equipo y acceda a la interfaz en `http://localhost:9090`

**Funciones del Agent Manager:**

| Funcion | Descripcion |
|---------|-------------|
| **Monitoreo de Estado** | Estado de Vector, PID, tiempo activo, metricas de transmision |
| **Gestion de Config** | Modo formulario (info del equipo) + modo edicion TOML directa |
| **Control de Proceso** | Iniciar/detener/reiniciar Vector, prueba de conexion |
| **Instalar Vector** | Descarga automatica de vector.exe desde el servidor maestro |
| **Actualizar Vector** | Verificacion de version + descarga de reemplazo |
| **Registro de Servicio** | Registrar/desregistrar como servicio Windows (inicio automatico) |

### 3. Archivos de Configuracion por Equipo

Lista los archivos TOML de todos los equipos registrados en la pagina de Configuracion del Transmisor.

- Haga clic en **Descargar** junto a cada equipo para descargas individuales
- Coloque los archivos TOML descargados en la misma carpeta que el ejecutable de Vector

### 4. Guia de Instalacion

Los metodos de instalacion se muestran en la parte inferior de la pagina.

## Pasos de Instalacion para PC de Equipo

### Metodo A: Usando Agent Manager (Recomendado)

```
1. Descargar agent-manager.exe y copiar al PC del equipo
2. Ejecutar agent-manager.exe → Abrir http://localhost:9090 en navegador
3. Pestana Gestion → Clic en "Instalar Vector" (descarga automatica)
4. Pestana Config → Ingresar info del equipo en modo formulario (ID, tipo, IP, linea, ruta de log, direccion del servidor)
5. Pestana Gestion → Clic en "Iniciar" para ejecutar Vector
6. (Opcional) Pestana Gestion → Registrar servicio Windows para inicio automatico
```

### Metodo B: Instalacion Manual

```
1. Descargar vector.zip → Extraer
2. Descargar TOML del equipo → Colocar en la misma carpeta
3. Editar archivo TOML:
   - include = ["C:/ruta/real/de/log/*.csv"]
   - address = "ip-real-del-servidor:6000"
4. Ejecutar: doble clic en start-vector.bat (data_dir se crea automaticamente)
   O registrar servicio: ejecutar install-service.bat como admin
5. Verificar estado en linea del Agent en el Dashboard
```
