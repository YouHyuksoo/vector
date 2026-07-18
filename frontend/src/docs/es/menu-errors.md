# Logs de Procesamiento

Esta pantalla lee SUCCESS/ERROR desde `data/process-logs/process-YYYY-MM-DD.jsonl` y permite filtrar por estado, etapa, destino, equipo y fecha.

Los ERROR con `RAW_DATA` se reprocesan por el flujo de ingesta directa. El sistema actual no usa tabla Oracle `LOG_ERROR` ni cola Redis para estos registros.
