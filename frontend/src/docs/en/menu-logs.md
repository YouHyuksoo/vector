# Log Viewer

## Overview

A page for viewing log data stored in Oracle DB, organized by table.
Used to verify that collected data is being stored correctly.

## Prerequisites

- Oracle DB must be connected
- At least one log table must exist in Oracle
- **Target Mapping** must be configured for data to be stored

## How to Use

### Step 1: Select a Table

Choose the table to view from the dropdown at the top.

- All log tables in Oracle DB are shown in the list
- Tables with the `LOG_` prefix are auto-generated log tables

### Step 2: Set Row Limit

- Default: **50 rows**
- Maximum: **500 rows**
- Enter a number directly to change the limit

### Step 3: View Data

Data is displayed immediately after selecting a table.

- All columns are shown in a horizontally scrollable table
- Long text values are automatically truncated
- Row count is displayed at the bottom

### Refresh

Click the **Reload** button to fetch the latest data.

## Tips

- Useful for verifying data is being stored correctly after config changes
- When failed jobs appear in the Errors page, check this page to see the last successfully stored data
