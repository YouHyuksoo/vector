# Receiver Configuration

Manage the central Vector Aggregator TOML and its backup history.

The form covers data/API settings, Vector input on 6000, Fluent input on 24224, the Fastify sink at `http://127.0.0.1:3110/api/logs`, batching, request concurrency, disk buffer safety, and target/timestamp options.

Use **VRL & Mapping** for equipment-specific parsing. Fastify, not the Aggregator, currently stores raw files under `RAW_LOG_BASE_PATH`.

Saving creates a backup. Preview or restore prior versions, then reload Vector to apply changes.
