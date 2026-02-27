# Sender Settings

## Overview

Create and manage Agent TOML configurations to be installed on each equipment PC.
Configure log paths, server connection info, and metadata per equipment.

## Prerequisites

- Fastify server must be running

## Screen Layout

### Left: Equipment List

All registered equipment is displayed as a list.

#### Add Equipment

1. Click the **Add** button
2. Enter an equipment name (uppercase letters, numbers, hyphens only)
   - Examples: `AOI-LINE01`, `SP-001`, `REFLOW-A`
3. Click confirm to create a default TOML template

#### Delete Equipment

1. Select the equipment to delete
2. Click the **Delete** button
3. Click **Confirm** in the popup

> Deletion is permanent and cannot be undone. Be cautious.

### Right: Agent Config Editor

Select equipment to edit its TOML configuration.

#### Equipment Info

| Item | Description | Example |
|------|-------------|---------|
| Equipment Type | Equipment category | SP, SPI, AOI, REFLOW, etc. |
| Log Type | Log classification | INSPECTION, ALARM, etc. |
| Line Code | Production line identifier | LINE-01, L1 |
| Equipment ID | Unique equipment ID | AOI-001, SP-A01 |

#### Connection Settings

| Item | Description | Default |
|------|-------------|---------|
| Server IP | Aggregator server address | `192.168.1.10` |
| Port | Aggregator receive port | `9000` |
| Read Mode | `end` (new only) / `beginning` (all) | `end` |
| File Expiry | Ignore older files (seconds) | `86400` (24h) |
| Timeout | Read timeout (ms) | `1000` |
| Buffer | Send buffer size (MB) | `256` |

#### Log Paths

Enter log file paths to monitor, one per line.

- Glob patterns supported: `C:/logs/*.csv`, `D:/data/**/*.log`
- Both Windows and Unix paths work
- Separate multiple paths with newlines

#### Direct TOML Editing

Toggle **Edit TOML directly** to edit the full TOML content directly.

### Save Config

Click **Save** to store the TOML file on the server.

### Download Config

Click **Download** to download the TOML file to your local PC.
Copy the downloaded file to the equipment PC.
