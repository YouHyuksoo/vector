# Configuración del Agent

Vector Agent o Fluent Bit observa archivos de log y los envía al Aggregator central.

Configure tipo de equipo, tipo de log, línea, ID, patrones include/exclude, posición de lectura y dirección central. La pantalla Emisor también permite fingerprint, multiline, búsqueda recursiva, carpeta de reenvío, buffer, compresión y acknowledgements.

Valide antes de guardar. No reinicie `data_dir` ni fingerprint sin necesidad, porque puede releer archivos.
