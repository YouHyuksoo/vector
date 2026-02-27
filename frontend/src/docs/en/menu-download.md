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

### 2. Equipment Config Files

Lists TOML files for all equipment registered in the Sender Settings page.

- Click **Download** next to each equipment for individual downloads
- Place downloaded TOML files in the same folder as the Vector executable

### 3. Installation Guide

A 5-step installation guide is shown at the bottom:

1. Download `vector.zip` and extract on equipment PC
2. Download the TOML config for your equipment
3. Change `include` paths in TOML to actual log locations
4. Change `address` to actual Aggregator server IP
5. Run: `vector.exe --config {equipment}.toml`

## Full Installation Steps for Equipment PC

```
1. Download vector.zip → Extract
2. Download equipment TOML → Place in same folder
3. Edit TOML file:
   - include = ["C:/actual/log/path/*.csv"]
   - address = "actual-server-ip:9000"
4. Run: vector.exe --config EQUIP-01.toml
5. Verify Agent online status on Dashboard
```
