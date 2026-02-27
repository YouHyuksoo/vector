# Error Log

## Overview

A page that aggregates and displays errors that occurred during log storage.
Auto-refreshes every 5 seconds for real-time error monitoring.

## Prerequisites

- Fastify server must be running
- Oracle DB must be connected

## Screen Layout

### Error Table

Each error entry shows the following information:

| Column | Description |
|--------|-------------|
| **Time** | Error occurrence timestamp |
| **Table** | Target Oracle table name |
| **Equipment** | Equipment ID that caused the error |
| **Message** | Detailed error description |

### Delete All

1. Click the **Delete All** button at the top
2. Click **Confirm** in the confirmation popup
3. All error logs are deleted and the count is displayed

> Deleted errors cannot be recovered. Record error details first if needed.

## Common Error Types

| Error Message | Cause | Solution |
|---------------|-------|----------|
| ORA-00942: table or view does not exist | Target table missing | Check table in Target Mapping |
| ORA-01400: cannot insert NULL | Required column has no value | Check SOURCE_FIELD in mapping |
| ORA-12899: value too large | Data exceeds column size | Adjust Oracle column size |
| Connection refused | DB connection failed | Check Oracle server status |
