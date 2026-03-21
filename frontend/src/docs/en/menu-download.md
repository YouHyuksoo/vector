# Agent Download

## Overview

Download the Vector engine, Agent Manager, and per-equipment TOML config files for installation on equipment PCs.

## Screen Layout

### 1. Vector Executable

Click **Download vector.zip** to download the Vector engine archive.

- File size: ~40MB
- Included files: `bin/vector.exe`, `config/`, `licenses/`, bat files
- Agent Manager's "Install Vector" feature auto-downloads and extracts this

### 2. Agent Manager

Click **Download agent-manager.exe** to download the equipment PC management tool.

- File size: ~45MB
- **Single exe file, runs standalone** (no Node.js, no extra files needed)
- Run it and access the management UI at `http://localhost:9090`
- **Multi-language**: Korean, English, Español, Tiếng Việt

**Agent Manager Features:**

| Feature | Description |
|---------|-------------|
| **Status Monitoring** | Vector running status, PID, uptime, transmission metrics |
| **Config Management** | Form mode (equipment info input) + direct TOML edit mode |
| **Process Control** | Start/stop/restart Vector, Aggregator connection test |
| **Vector Install** | Auto-download vector.zip from master server + extract |
| **Vector Update** | Version check + download replacement |
| **Service Registration** | Register/unregister as Windows service (auto-start) |

### 3. Equipment Config Files

Lists TOML files for all equipment registered in the Sender Settings page.

- Click **Download** next to each equipment for individual downloads
- Save downloaded TOML files to `C:\vector\` folder
- Agent Manager auto-detects .toml files in the config folder (any filename)

## Equipment PC Installation Steps

### Method A: Using Agent Manager (Recommended)

```
1. Download agent-manager.exe → run on equipment PC
2. Open http://localhost:9090
3. Management tab → Click "Install Vector" (auto-download + extract to C:\vector\)
4. Download equipment TOML from this page → save to C:\vector\
5. Settings tab → verify/edit equipment info (log path, IP, etc.) → save
6. Management tab → Click "Start"
7. (Optional) Management tab → Register Windows service for auto-start
```

### Method B: Manual Installation

```
1. Download vector.zip → extract to C:\vector\
2. Download equipment TOML → save to C:\vector\
3. Edit TOML file:
   - include = ["C:\\actual\\log\\path\\*.csv"]
   - address = "actual-server-ip:6000"
4. Run: double-click start-vector.bat
   Or register service: run install-service.bat as admin
5. Verify Agent online status on Dashboard
```
