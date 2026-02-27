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

Extract the archive to your desired path on the equipment PC.

```
C:\vector\
  ├── vector.exe
  └── (config file location)
```

### 3. Place Config File

Download the TOML config file for your equipment from the **Agent Download** page and place it in the same folder.

```
C:\vector\
  ├── vector.exe
  └── EQUIP-01.toml
```

### 4. Edit Config File

Update the following in the TOML file to match your environment:

- **include**: Actual log file paths
- **address**: Aggregator server IP and port

### 5. Run

```bash
vector.exe --config EQUIP-01.toml
```

## Folder Structure

```
Project Root/
├── config/
│   ├── aggregator.toml    # Aggregator (receiver) config
│   └── agents/            # Per-equipment Agent configs
│       ├── EQUIP-01.toml
│       └── EQUIP-02.toml
├── data/                  # Collected data storage
├── logs/                  # System logs
└── vector.exe             # Vector engine
```

## Service Registration (Optional)

Register as a Windows service for auto-start on boot:

```bash
sc create VectorAgent binPath= "C:\vector\vector.exe --config C:\vector\EQUIP-01.toml"
sc config VectorAgent start= auto
```
