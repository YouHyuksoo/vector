# Solución de Problemas

## Agent fuera de línea

Confirme que Agent Manager y Vector están activos, revise dirección e ID y pruebe:

```powershell
Test-NetConnection 20.10.30.112 -Port 6000
```

## En línea sin logs

Revise include/exclude, `read_from`, antigüedad, fingerprint y multiline. Use Diagnóstico para conteos de source y conexiones 6000; luego confirme llegada en Archivos de Log Raw.

## Crece el buffer

Compare source y sink. Revise Backend, pool/conexión Oracle, espacio de `vector-data` y Logs del Sistema.

## Falla Oracle

Revise etapa y destino, compare VRL con `config/table-registry.json`, pruebe la conexión Oracle y reintente los datos raw guardados.
