# Descarga de Agent

## Resumen

Descargue el motor Vector, Agent Manager y los archivos de configuración TOML por equipo para instalación en PCs de equipos.

## Diseño de Pantalla

### 1. Ejecutable Vector

Haga clic en **Descargar vector.zip** para descargar el archivo del motor Vector.

- Tamaño del archivo: ~40MB
- Archivos incluidos: `bin/vector.exe`, `config/`, `licenses/`, archivos bat
- La función "Instalar Vector" de Agent Manager lo descarga y extrae automáticamente

### 2. Agent Manager

Haga clic en **Descargar agent-manager.exe** para descargar la herramienta de gestión integral.

- Tamaño del archivo: ~45MB
- **Un solo archivo exe, ejecución independiente** (sin Node.js, sin archivos adicionales)
- Ejecútelo y acceda a la interfaz en `http://localhost:9090`
- **Multiidioma**: coreano, inglés, español y vietnamita

**Funciones del Agent Manager:**

| Función | Descripción |
|---------|-------------|
| **Monitoreo de Estado** | Estado de Vector, PID, tiempo activo, métricas de transmisión |
| **Gestión de Config** | Modo formulario (info del equipo) + modo edición TOML directa |
| **Control de Proceso** | Iniciar/detener/reiniciar Vector, prueba de conexión |
| **Instalar Vector** | Descarga automática de vector.zip + extracción |
| **Actualizar Vector** | Verificación de versión + descarga de reemplazo |
| **Registro de Servicio** | Registrar/desregistrar como servicio Windows (inicio automático) |

### 3. Archivos de Configuración por Equipo

Lista los archivos TOML de todos los equipos registrados en la página de Configuración del Transmisor.

- Haga clic en **Descargar** junto a cada equipo para descargas individuales
- Guarde los archivos TOML descargados en la carpeta `C:\vector\`
- Agent Manager detecta automáticamente archivos .toml en la carpeta config (cualquier nombre)

## Pasos de Instalación para PC de Equipo

### Método A: Usando Agent Manager (Recomendado)

```
1. Descargar agent-manager.exe → ejecutar en el PC del equipo
2. Abrir http://localhost:9090
3. Pestaña Gestión → Clic en "Instalar Vector" (descarga + extracción a C:\vector\)
4. Descargar TOML del equipo desde esta página → guardar en C:\vector\
5. Pestaña Config → verificar/editar info del equipo (ruta de log, IP) → guardar
6. Pestaña Gestión → Clic en "Iniciar"
7. (Opcional) Pestaña Gestión → Registrar servicio Windows para inicio automático
```

### Método B: Instalación Manual

```
1. Descargar vector.zip → extraer en C:\vector\
2. Descargar TOML del equipo → guardar en C:\vector\
3. Editar archivo TOML:
   - include = ["C:\\ruta\\real\\de\\log\\*.csv"]
   - address = "ip-real-del-servidor:6000"
4. Ejecutar: doble clic en start-vector.bat
   O registrar servicio: ejecutar install-service.bat como admin
5. Verificar estado en línea del Agent en el Dashboard
```
