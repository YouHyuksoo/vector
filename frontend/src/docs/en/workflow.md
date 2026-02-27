# Workflow

## Data Flow Overview

```
Equipment Log Files → Agent(Vector) → Aggregator(Vector) → Fastify API → Oracle DB
```

## Step-by-Step Process

### Step 1: Log Collection (Agent)

The Vector Agent installed on each equipment PC monitors log files.

- **file source**: Reads log files at the specified path in tail mode
- Detects new lines in real time
- Automatically attaches metadata (equipment type, line code, equipment ID)

### Step 2: Log Transmission (Agent → Aggregator)

The Agent sends collected logs to the Aggregator server.

- **vector sink**: Uses Vector's native TCP-based protocol
- Auto-retry and buffering on network failures
- Batch transmission for network efficiency

### Step 3: Log Parsing (Aggregator)

The Aggregator parses logs using VRL (Vector Remap Language).

- Applies VRL parsing code per equipment type
- Supports CSV, fixed-length, key-value, and other formats
- Converts parsed results into structured JSON fields

### Step 4: API Delivery (Aggregator → Fastify)

Delivers parsed data to the Fastify server via HTTP API.

- JSON-encoded batch transmission
- Exponential backoff retry on failure

### Step 5: DB Storage (Fastify → Oracle)

The Fastify server stores data in Oracle DB.

- **TABLE mode**: Direct INSERT into tables
- **PROCEDURE mode**: Execute stored procedures for business logic
- Async processing via BullMQ queues for reliability

## Monitoring Points

| Location | What to Check |
|----------|---------------|
| Dashboard | Infrastructure status (Server, Redis, Oracle, Vector) |
| Queue Status | Wait/Active/Done/Fail counts |
| Equipment Collectors | Agent heartbeat and online status |
| Error Log | Storage failure logs |
