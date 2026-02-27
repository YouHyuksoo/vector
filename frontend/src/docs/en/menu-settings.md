# System Settings

## Overview

Manage system-wide configuration for server, database, Redis, queues, and more.
The bottom section contains AI model settings for configuring AI used in the VRL Simulator.

## Prerequisites

- Fastify server must be running
- Some settings require a server restart after changes

## How to Use

### View Settings

Upon entering the page, current system settings are displayed in 6 sections.

### Edit Settings

1. Click **Edit** to enter edit mode
2. Modify values for each item
3. Click **Save** to save changes
4. Click **Cancel** to discard changes

### Setting Sections

#### Server

| Item | Description | Example |
|------|-------------|---------|
| HOST | Server bind IP | `0.0.0.0` |
| PORT | HTTP port | `3100` |
| NODE_ENV | Runtime environment | `production` |

> Changing the server port requires a restart.

#### Oracle

| Item | Description | Example |
|------|-------------|---------|
| HOST | DB server IP | `192.168.1.100` |
| PORT | Listener port | `1521` |
| SID | Database SID | `ORCL` |
| USER | Connection account | `log_user` |
| PASSWORD | Password | `****` |
| POOL_MIN | Minimum connection pool | `2` |
| POOL_MAX | Maximum connection pool | `10` |

> Changing Oracle connection info requires a restart.

#### Redis

| Item | Description | Example |
|------|-------------|---------|
| HOST | Redis server IP | `127.0.0.1` |
| PORT | Redis port | `6379` |
| PASSWORD | Auth password | (may be empty) |

#### Queue

| Item | Description | Default |
|------|-------------|---------|
| CONCURRENCY | Concurrent workers | `5` |
| BATCH_SIZE | Batch size | `10` |
| BATCH_TIMEOUT_MS | Batch timeout (ms) | `5000` |

#### Storage

| Item | Description | Example |
|------|-------------|---------|
| RAW_LOG_BASE_PATH | Raw log storage path | `/data/raw` |

#### Heartbeat

| Item | Description | Default |
|------|-------------|---------|
| TTL_SECONDS | Agent heartbeat expiry (seconds) | `60` |

> Agents are shown as offline when no heartbeat is received within this time.

## AI Model Settings

Configure AI models used for VRL code generation in the VRL Simulator.

### Supported Models

| Provider | Models |
|----------|--------|
| **Google Gemini** | 2.5 Flash, 2.5 Pro, 2.0 Flash, 2.0 Flash-Lite |
| **Mistral AI** | Large, Small, Codestral, Nemo |
| **Anthropic Claude** | Sonnet 4, Haiku 4.5, Opus 4 |

### Configuration Steps

1. Enter the **API key** for the AI provider
2. Select the **model** to use
3. Toggle **Enable**
4. Click **Test** to verify API connectivity
   - Success: Response time (ms) is displayed
   - Failure: Error message is shown

> The API key must be entered before the enable toggle works.
> Enabled models become available in the VRL Simulator's AI generation feature.
