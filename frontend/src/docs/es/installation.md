# Instalación del Recolector

## Recomendado: Agent Manager

1. Descargue la arquitectura correcta desde **Descarga de Agent**.
2. Ejecútelo en el PC del equipo y abra `http://localhost:9090`.
3. Instale Vector en `C:\vector` desde la pantalla de gestión.
4. Descargue el TOML del equipo en la misma carpeta.
5. Verifique metadatos, rutas de log y dirección del servidor.
6. Inicie Vector y, si es necesario, regístrelo como servicio Windows.
7. Confirme el estado en **Panel de Equipos**.

Para instalación manual, extraiga `vector.zip` o `vector-x86.zip`, coloque el TOML y configure `IP-servidor:6000`. Fluent Bit usa el puerto 24224.
