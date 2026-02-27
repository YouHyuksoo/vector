# Dashboard

## Overview

The main monitoring screen that provides an at-a-glance view of the entire system status.
Data auto-refreshes every 5 seconds for real-time infrastructure monitoring.

## Prerequisites

- Fastify server (port 3100) must be running
- Redis and Oracle DB must be connected for proper status display

## Screen Layout

### Infrastructure Status Card

Displays the status of 4 core system components.

| Item | Display | Normal State |
|------|---------|-------------|
| **Server** | Fastify server uptime | Green "up" |
| **Redis** | Connection status | Green "connected" |
| **Oracle** | Registered table count | Green "N tables" |
| **Vector** | Collection engine status | Green "ok" |

- The Vector item has **Start/Stop** buttons to directly control the collection engine

### Queue Status

Shows the BullMQ job queue processing status.

- **Wait**: Unprocessed log count
- **Active**: Currently being stored to Oracle DB
- **Done**: Successfully processed count
- **Fail**: Failed storage count (check Errors page for details)

### Registered Tables

Displays the list of log storage tables in Oracle DB with column counts for each.

### Equipment Collectors

Shows the online/offline status of Agents installed on each equipment PC.

- **Green dot**: Online (receiving heartbeats)
- **Gray dot**: Offline (no heartbeat)
- Each card shows equipment type, line code, equipment ID, and last seen time
- Top section shows total/online/offline equipment statistics
