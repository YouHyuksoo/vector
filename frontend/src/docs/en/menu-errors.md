# Processing Logs

This auxiliary screen reads SUCCESS/ERROR records from `data/process-logs/process-YYYY-MM-DD.jsonl`. Filter by status, stage, target, equipment, and time.

ERROR records with `RAW_DATA` can be reprocessed through the direct ingestion flow. The current system does not use an Oracle `LOG_ERROR` table or Redis queue for these records.
