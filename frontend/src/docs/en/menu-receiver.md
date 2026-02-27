# Receiver Settings

## Overview

Edit the TOML configuration of the Aggregator (collection server) running on the server.
The Aggregator receives logs from all equipment Agents, parses them with VRL, and forwards them to the API server.

## Prerequisites

- Fastify server must be running
- `config/aggregator.toml` file must exist on the server

## Screen Layout

### Left: Configuration Editor

#### Basic Settings

| Item | Description | Default |
|------|-------------|---------|
| Data Directory | Vector internal data storage path | `/data/vector` |
| Vector API IP | Vector management API bind IP | `0.0.0.0` |
| API Port | Vector management API port | `8686` |

#### Agent Source

| Item | Description | Default |
|------|-------------|---------|
| Listen IP | IP to accept Agent connections | `0.0.0.0` |
| Listen Port | Agent connection port | `9000` |

> This port must be open in the firewall for Agents to connect.

#### Raw File Storage

Settings for saving collected raw logs to files.

| Item | Description |
|------|-------------|
| Path Pattern | Auto-categorized storage by equipment type (e.g., `/data/raw/{{ equipment_type }}/...`) |
| Buffer Size | File write buffer (MB) |

#### Target Routing

Select data storage method per equipment type.

- **TABLE INSERT**: Direct INSERT into Oracle tables (default)
- **PROCEDURE CALL**: Call Oracle procedures for storage

Each equipment type can be configured independently.
Default target name format: `LOG_{equipment_type}`.

#### API Sink

| Item | Description | Default |
|------|-------------|---------|
| API URI | Fastify server endpoint | `http://localhost:3100/api/logs/ingest` |
| Batch Size | Events per batch | `10` |
| Batch Interval | Batch timeout (seconds) | `5s` |
| Buffer Size | Send buffer (MB) | - |
| Initial Backoff | First retry wait time | `1s` |
| Max Duration | Maximum retry wait | `10s` |

#### Direct TOML Editing

Toggle **Edit TOML directly** to edit the full configuration file as raw text.

> Be careful with TOML syntax when editing directly.

### Right: Change History

Backups are automatically created whenever the config file changes.

#### Backup List

Each backup shows:
- **Date**: Backup creation time
- **Source**: Change origin (editor, vrl-apply, restore)
- **Size**: File size

#### Preview

Click **Preview** to view the config file contents at that point in time.

#### Restore

1. Click the **Restore** button on the desired backup
2. Click **Confirm** in the popup
3. Current config is replaced with the selected backup (current config is auto-backed up first)

### Save & Apply

1. Click **Save** after editing
2. A "Restart Vector" modal appears
3. **Restart**: Apply changes immediately (restarts Vector engine)
4. **Later**: Save config only, restart manually later
