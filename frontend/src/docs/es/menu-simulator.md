# Simulador VRL

## Resumen

Un entorno integrado para desarrollar y probar codigo de analisis VRL (Vector Remap Language).
Previsualice resultados de analisis con muestras de log reales y aplique codigo verificado directamente al Aggregator.

## Prerrequisitos

- El servidor Fastify debe estar en ejecucion
- El motor Vector (`vector.exe`) debe estar instalado en el servidor (usado para simulacion)
- Para generacion de codigo AI, al menos un modelo AI debe estar habilitado en **Configuracion > Modelos AI**

## Como Usar

### Paso 1: Seleccionar Tipo de Equipo

Elija el tipo de equipo a analizar en la parte superior.

- SP, SPI, MAOI, AOI, REFLOW, ICT, FCT, BURNIN, HIPOT, EOL, METALMASK, MOUNTER, VISCOSITY
- Si ya existe codigo VRL para el tipo seleccionado, se carga automaticamente

### Paso 2: Preparar Log de Muestra

Prepare el log de muestra a analizar en el area izquierda.

**Entrada directa**:
- Pegue datos de log reales en el area de texto

**Carga de archivo**:
- Haga clic en **Cargar archivo** para cargar un archivo de log
- Formatos soportados: `.txt`, `.csv`, `.log`, `.tsv`

### Paso 3: Escribir Codigo VRL

Escriba el codigo de analisis VRL en el area derecha.

**Ejemplo manual**:
```
lines = split!(.message, ",")
.data.INSPECTOR = get!(lines, [0])
.data.MODEL = get!(lines, [1])
.data.RESULT = get!(lines, [2])
```

**Auto-generacion AI**:
1. Seleccione el modelo AI a usar (Gemini, Mistral, Claude)
2. Describa las reglas de analisis en lenguaje natural
   - ej., "separado por comas, 1er campo es INSPECTOR, 2do es MODEL, 3ro es RESULT"
3. Haga clic en **Generar AI** para auto-generar codigo VRL
4. Modifique el codigo generado segun sea necesario

### Paso 4: Ejecutar Simulacion

Haga clic en el boton **Simular**.

- **Exito**: Los campos y valores analizados se muestran en el area de resultados
- **Fallo**: Se muestran mensajes de error de sintaxis o runtime VRL
- Revise los resultados e itere modificando el codigo y re-ejecutando

### Paso 5: Aplicar al TOML

Cuando el analisis funcione correctamente, haga clic en **Aplicar al TOML**.

1. El codigo VRL se inserta en el bloque transform del equipo correspondiente en aggregator.toml
2. Los campos de analisis se sincronizan automaticamente a la BD (reflejados en desplegables de Mapeo de Destino)
3. Aparece un modal de reinicio de Vector

> Siempre verifique con simulacion antes de aplicar al TOML.

## Consejos para Escribir Codigo VRL

### Analisis de formato CSV
```
lines = split!(.message, ",")
.data.FIELD1 = get!(lines, [0])
.data.FIELD2 = get!(lines, [1])
```

### Analisis de formato clave-valor
```
pairs = split!(.message, ";")
for_each(pairs) -> |_i, pair| {
  kv = split!(pair, "=")
  key = strip_whitespace!(get!(kv, [0]))
  .data = set!(.data, [key], get!(kv, [1]))
}
```

### Analisis de longitud fija
```
.data.CODE = slice!(.message, 0, 10)
.data.VALUE = slice!(.message, 10, 20)
```
