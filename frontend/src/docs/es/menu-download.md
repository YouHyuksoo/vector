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

### 2. Archivos de Configuracion por Equipo

Lista los archivos TOML de todos los equipos registrados en la pagina de Configuracion del Transmisor.

- Haga clic en **Descargar** junto a cada equipo para descargas individuales
- Coloque los archivos TOML descargados en la misma carpeta que el ejecutable de Vector

### 3. Guia de Instalacion

Se muestra una guia de instalacion de 5 pasos en la parte inferior:

1. Descargue `vector.zip` y extraiga en el PC del equipo
2. Descargue la configuracion TOML para su equipo
3. Cambie las rutas `include` en el TOML a las ubicaciones reales de log
4. Cambie `address` a la IP real del servidor Aggregator
5. Ejecute: `vector.exe --config {equipo}.toml`

## Pasos Completos de Instalacion para PC de Equipo

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
