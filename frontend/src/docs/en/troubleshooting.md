# Troubleshooting

## Agent offline

Confirm Agent Manager and Vector are running, verify the TOML address and equipment ID, then test the central input:

```powershell
Test-NetConnection 20.10.30.112 -Port 6000
```

## Online but no logs

Check include/exclude patterns, `read_from`, file age, fingerprint, and multiline. Use Operations Diagnostics for source counts and port 6000 connections, then Raw Log Files to confirm arrival.

## Buffer growth

Compare source and sink counts. Check Backend, Oracle pool/connectivity, `vector-data` disk space, and System Logs.

## Oracle failure

Inspect stage and target in System Logs, compare VRL output with `config/table-registry.json`, run the Oracle connection test, then retry the stored raw data.
