# Troubleshooting

## Common Errors

### Agent Not Connecting to Server

**Symptom**: Agent does not appear in the equipment collector list

**Checklist**:
1. Verify the Aggregator server is running
2. Check that the Agent TOML `address` has the correct server IP:port
3. Ensure the firewall allows the port (default 9000)
4. Test network connectivity: `ping {server IP}`

**Solution**:
```bash
# Test port connectivity
telnet 192.168.1.10 9000
```

### Logs Not Being Collected

**Symptom**: Agent is online but no data is coming in

**Checklist**:
1. Verify the TOML `include` path matches the actual log file location
2. Check the log file was modified within `ignore_older_secs`
3. Ensure the Vector process has read permissions for the file

### Oracle DB Connection Failure

**Symptom**: Oracle status shows "down" on the dashboard

**Checklist**:
1. Verify Oracle connection settings on the **Settings** page
2. Check Oracle listener status: `lsnrctl status`
3. Verify the SID/service name is correct
4. Check if account password has expired

### Failed Jobs Accumulating in Queue

**Symptom**: "Fail" count increasing in queue status

**Checklist**:
1. Check detailed error messages on the **Errors** page
2. Verify Oracle table structure matches the mapping
3. Ensure required fields are not missing

## Debugging Methods

### Check Vector Logs

```bash
# Run in verbose mode
vector.exe --config config.toml --verbose

# View logs for specific components only
VECTOR_LOG=debug vector.exe --config config.toml
```

### Check API Server Logs

Monitor real-time logs in the Fastify server console.

### Check Redis Queue Status

```bash
redis-cli
> KEYS bull:*
> LLEN bull:log-queue:wait
```

## Performance Tuning

| Item | Recommended | Description |
|------|-------------|-------------|
| `batch.max_events` | 10–50 | API batch size |
| `batch.timeout_secs` | 5–10 | Batch interval |
| `buffer.max_events` | 500 | Memory buffer size |
| BullMQ concurrency | 5 | Queue concurrency |
