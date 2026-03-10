# Agent Download

## Overview

Download the Vector engine and per-equipment TOML config files for installation on equipment PCs.

## Prerequisites

- Fastify server must be running
- `vector.zip` must be available on the server's download path
- Equipment must be registered in **Sender Settings** to download config files

## Screen Layout

### 1. Vector Executable

Click **Download vector.zip** to download the Vector engine archive.

- File size: ~40MB
- Extract on the equipment PC before use
- Included files: `bin/vector.exe`, `start-vector.bat`, `stop-vector.bat`, `install-service.bat`, `uninstall-service.bat`

### 2. Agent Manager

Click **Download agent-manager.exe** to download the equipment PC management tool.

- File size: ~45MB
- Standalone executable — no Node.js installation required
- Run `agent-manager.exe` on the equipment PC and access the management UI at `http://localhost:9090`

**Agent Manager Features:**

| Feature | Description |
|---------|-------------|
| **Status Monitoring** | Vector running status, PID, uptime, transmission metrics |
| **Config Management** | Form mode (equipment info input) + direct TOML edit mode |
| **Process Control** | Start/stop/restart Vector, Aggregator connection test |
| **Vector Install** | Auto-download vector.exe from master server |
| **Vector Update** | Version check + download replacement |
| **Service Registration** | Register/unregister as Windows service (auto-start) |

### 3. Equipment Config Files

Lists TOML files for all equipment registered in the Sender Settings page.

- Click **Download** next to each equipment for individual downloads
- Place downloaded TOML files in the same folder as the Vector executable

### 4. Installation Guide

Installation methods are shown at the bottom of the page.

## Equipment PC Installation Steps

### Method A: Using Agent Manager (Recommended)

```
1. Download agent-manager.exe and copy to equipment PC
2. Run agent-manager.exe → Open http://localhost:9090 in browser
3. Management tab → Click "Install Vector" (auto-download)
4. Settings tab → Enter equipment info in form mode (ID, type, IP, line, log path, server address)
5. Management tab → Click "Start" to run Vector
6. (Optional) Management tab → Register Windows service for auto-start
```

### Method B: Manual Installation

```
1. Download vector.zip → Extract
2. Download equipment TOML → Place in same folder
3. Edit TOML file:
   - include = ["C:/actual/log/path/*.csv"]
   - address = "actual-server-ip:6000"
4. Run: double-click start-vector.bat (data_dir auto-created)
   Or register service: run install-service.bat as admin
5. Verify Agent online status on Dashboard
```
