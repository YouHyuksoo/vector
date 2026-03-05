# Installation Guide

## System Requirements

| Item | Minimum |
|------|---------|
| OS | Windows 10+ / Linux (x64) |
| RAM | 512MB or more |
| Disk | 100MB (Vector engine) + log storage |
| Network | TCP connectivity to Aggregator server |

## Installation Steps

### 1. Download Vector Engine

Download `vector.zip` from the **Agent Download** page in the admin panel.

### 2. Extract

Extract the archive to your desired path on the equipment PC. The zip includes executables and batch scripts.

```
C:\vector\
  ├── bin\vector.exe         # Vector engine executable
  ├── start-vector.bat       # Manual start script
  ├── stop-vector.bat        # Manual stop script
  ├── install-service.bat    # Windows service registration
  └── uninstall-service.bat  # Windows service removal
```

### 3. Place Config File

Download the TOML config file for your equipment from the **Agent Download** page and place it in the same folder.

```
C:\vector\
  ├── bin\vector.exe
  ├── start-vector.bat
  ├── install-service.bat
  └── SPI.toml              # Equipment TOML config
```

### 4. Edit Config File

Update the following in the TOML file to match your environment:

- **include**: Actual log file paths
- **address**: Aggregator server IP and port
- **data_dir**: Vector internal data storage path (auto-created if missing)

### 5. Run

**Method 1 - Batch file (recommended):**

Double-click `start-vector.bat` to auto-detect the TOML file and start Vector.

- If the `data_dir` folder in TOML doesn't exist, it is **auto-created**
- Warns if Vector is already running

**Method 2 - Direct execution:**

```bash
bin\vector.exe --config SPI.toml
```

## Folder Structure

```
Install Folder/
├── bin/
│   └── vector.exe           # Vector engine
├── start-vector.bat         # Manual start
├── stop-vector.bat          # Manual stop
├── install-service.bat      # Service registration
├── uninstall-service.bat    # Service removal
├── EQUIP-01.toml            # Equipment config file
└── config/                  # Default Vector config (reference)
```

## Service Registration (Optional)

Register as a Windows service for auto-start on boot.

**Run `install-service.bat` as administrator:**

1. Right-click → "Run as administrator"
2. If multiple TOML files exist, a selection prompt appears
3. `data_dir` folder is auto-created if missing
4. Service name: `VectorAgent_{equipment}` (e.g., `VectorAgent_SPI`)
5. Auto-restart policy on failure (5s/10s/30s)
6. To uninstall: run `uninstall-service.bat`
