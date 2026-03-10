# Guía de Instalación

## Requisitos del Sistema

| Elemento | Mínimo |
|----------|--------|
| SO | Windows 10+ / Linux (x64) |
| RAM | 512MB o más |
| Disco | 100MB (motor Vector) + almacenamiento de logs |
| Red | Conectividad TCP al servidor Aggregator |

## Pasos de Instalación

### 1. Descargar Motor Vector

Descargue `vector.zip` desde la página **Descarga de Agent** en el panel de administración.

### 2. Extraer

Extraiga el archivo en la ruta deseada en el PC del equipo. El zip incluye ejecutables y scripts batch.

```
C:\vector\
  ├── bin\vector.exe         # Ejecutable del motor Vector
  ├── start-vector.bat       # Script de inicio manual
  ├── stop-vector.bat        # Script de parada manual
  ├── install-service.bat    # Registro de servicio Windows
  └── uninstall-service.bat  # Eliminación de servicio Windows
```

### 3. Colocar Archivo de Configuración

Descargue el archivo de configuración TOML para su equipo desde la página **Descarga de Agent** y colóquelo en la misma carpeta.

```
C:\vector\
  ├── bin\vector.exe
  ├── start-vector.bat
  ├── install-service.bat
  └── SPI.toml              # Configuración TOML del equipo
```

### 4. Editar Archivo de Configuración

Actualice lo siguiente en el archivo TOML según su entorno:

- **include**: Rutas reales de archivos de log
- **address**: IP y puerto del servidor Aggregator
- **data_dir**: Ruta de almacenamiento de datos internos de Vector (se crea automáticamente si no existe)

### 5. Ejecutar

**Método 1 - Archivo batch (recomendado):**

Haga doble clic en `start-vector.bat` para detectar automáticamente el archivo TOML e iniciar Vector.

- Si la carpeta `data_dir` del TOML no existe, se **crea automáticamente**
- Advierte si Vector ya está en ejecución

**Método 2 - Ejecución directa:**

```bash
bin\vector.exe --config SPI.toml
```

## Estructura de Carpetas

```
Carpeta de Instalación/
├── bin/
│   └── vector.exe           # Motor Vector
├── start-vector.bat         # Inicio manual
├── stop-vector.bat          # Parada manual
├── install-service.bat      # Registro de servicio
├── uninstall-service.bat    # Eliminación de servicio
├── EQUIP-01.toml            # Archivo de configuración del equipo
└── config/                  # Configuración Vector por defecto (referencia)
```

## Registro de Servicio (Opcional)

Regístrese como servicio de Windows para inicio automático al arrancar.

**Ejecute `install-service.bat` como administrador:**

1. Clic derecho → "Ejecutar como administrador"
2. Si existen múltiples archivos TOML, aparece un menú de selección
3. La carpeta `data_dir` se crea automáticamente si no existe
4. Nombre del servicio: `VectorAgent_{equipo}` (ej., `VectorAgent_SPI`)
5. Política de reinicio automático en caso de fallo (5s/10s/30s)
6. Para desinstalar: ejecute `uninstall-service.bat`
