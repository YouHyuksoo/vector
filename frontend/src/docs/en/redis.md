# Redis

## What is Redis?

Redis is an **ultra-fast in-memory data store**.
It stores data in RAM instead of disk, making reads and writes extremely fast.

In this system, Redis is not used for permanent data storage like Oracle.
Instead, it handles **two tasks that need fast, temporary processing**.

## Role 1: Job Queue (BullMQ)

### Why a Queue?

If thousands of logs arrive at once, inserting them directly into Oracle could cause overload.
Instead, we create a **queue** in Redis and process them in order.

```
Bulk log arrival
    ↓
Stack in Redis queue (immediate response — "accepted")
    ↓
Worker pulls 5 at a time
    ↓
Store in Oracle
```

### Queue Status

The **Queue Status** card on the dashboard shows this Redis queue state.

| Status | Meaning |
|--------|---------|
| **Wait** | Jobs stacked in queue, not yet processed |
| **Active** | Worker is currently storing to Oracle |
| **Done** | Successfully stored in Oracle |
| **Fail** | Failed after 3 retry attempts |

### Priority

- **ALARM logs** → Priority 1 (processed first)
- **Normal logs** → Priority 5

### Retry

On storage failure, the system automatically retries 3 times (1s → 2s → 4s intervals).
If all 3 fail, the job is kept in **Failed** status and can be checked on the **Errors** page.

## Role 2: Equipment Heartbeat (Online/Offline Detection)

### How It Works

```
Equipment Agent → "I'm alive" (heartbeat) → Saved in Redis with 60-second timer
                                              ↓
                                  Comes again within 60s → Timer reset (stays online)
                                  Doesn't come within 60s → Auto-deleted = Offline
```

### Why Redis?

- Heartbeats arrive from dozens of equipment **every few seconds**
- Storing this in Oracle would be too slow
- Redis processes in memory at **millisecond latency**
- TTL (Time To Live) feature auto-deletes expired entries — no cleanup code needed

### Dashboard Integration

The **Equipment Collectors** card on the dashboard reads this Redis data.

| Display | Meaning |
|---------|---------|
| 🟢 Green dot | Heartbeat exists in Redis → Online |
| ⚫ Gray dot | TTL expired and deleted → Offline |

## Oracle vs Redis Comparison

| | Oracle | Redis |
|---|--------|-------|
| **Storage** | Hard disk | RAM (memory) |
| **Speed** | Relatively slow | Ultra-fast (milliseconds) |
| **Data lifetime** | Permanent | Temporary (deleted on TTL expiry) |
| **Purpose** | Log data, mapping config | Job queue, real-time status |
| **On server restart** | Data persists | Data lost (queue can recover after restart) |

## Settings

Manage Redis connection settings on the **Settings** page.

| Item | Description | Default |
|------|-------------|---------|
| HOST | Redis server IP | `127.0.0.1` |
| PORT | Redis port | `6379` |
| PASSWORD | Auth password | (none) |

## Impact of Failures

| Situation | Impact |
|-----------|--------|
| Redis down | Cannot queue logs, cannot store heartbeats, dashboard status unavailable |
| Redis restart | Unprocessed logs in queue may be lost, all heartbeats reset (temporary offline display) |
| Oracle down | Logs keep stacking in queue but cannot be stored (Redis acts as buffer) |

> Since Redis downtime affects the entire system, stable operation is critical.
