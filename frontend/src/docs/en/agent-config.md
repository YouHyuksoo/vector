# Agent Configuration

## Overview

The Agent is a component installed on each equipment PC that collects log files and sends them to the Aggregator server.

## TOML Config Structure

```toml
data_dir = "./data"

[sources.file_log]
type = "file"
include = ["C:/logs/*.csv"]
read_from = "end"
ignore_older_secs = 86400

[transforms.add_meta]
type = "remap"
inputs = ["file_log"]
source = '''
  .equip_type = "AOI"
  .line_code = "LINE-01"
  .equip_id = "AOI-001"
'''

[sinks.to_aggregator]
type = "vector"
inputs = ["add_meta"]
address = "192.168.1.10:9000"
```

## Key Settings

### Source (Log Collection)

| Item | Description | Example |
|------|-------------|---------|
| `include` | Log file paths to watch | `["C:/logs/*.csv"]` |
| `read_from` | Read start position | `end` (new only) / `beginning` (all) |
| `ignore_older_secs` | Ignore older files (seconds) | `86400` (24 hours) |

### Transform (Metadata)

| Item | Description |
|------|-------------|
| `equip_type` | Equipment type (SP, SPI, AOI, etc.) |
| `line_code` | Line code |
| `equip_id` | Unique equipment ID |

### Sink (Server Transmission)

| Item | Description |
|------|-------------|
| `address` | Aggregator server IP:port |

## Per-Equipment Configuration

Edit via GUI on the **Sender** page, or use the direct TOML edit mode.

### Log Path Examples

| Equipment Type | Path Pattern |
|----------------|-------------|
| SP | `C:/SP_DATA/results/*.csv` |
| SPI | `D:/SPI/inspection/*.log` |
| AOI | `C:/AOI/output/*.dat` |
| REFLOW | `C:/REFLOW/temp/*.csv` |

## Configuration Methods

### Method 1: Agent Manager (Configure directly on equipment PC)

Run `agent-manager.exe` on the equipment PC to configure via local web UI (`http://localhost:9090`).

1. **Settings tab → Form mode**: Enter equipment ID, type, IP, line code, log type, log path, Aggregator address/port
2. **Settings tab → TOML edit mode**: Directly edit the raw TOML
3. After saving, restart Vector from the **Management tab**

Saving via form mode automatically syncs `add_metadata` VRL source and `heartbeat.metrics.tags` in the TOML.

### Method 2: Admin Panel (Master server)

1. Select equipment on the **Sender** page
2. Enter equipment info (type, line code, ID)
3. Configure log paths and server connection
4. Save, then download the config from the **Agent Download** page
