# Target Mapping

## Overview

Configure how collected log data from equipment is stored in Oracle DB.
Map each field of the collected log to Oracle table columns or procedure parameters.

## Prerequisites

- Oracle DB must be connected
- Target **tables** or **procedures** must already exist in Oracle
- For per-log-type mapping, **VRL Simulator** parsing rules must be configured first

## How to Use

### Step 1: Select Target Type

Choose one of two modes at the top:

- **Table**: Direct INSERT into Oracle tables
- **Procedure**: CALL Oracle procedures/packages

### Step 2: Select Target (Left Panel)

**Table mode**:
- Shows the list of Oracle tables
- Use the search filter to find the desired table
- Click a table to display its columns on the right

**Procedure mode**:
- Shows the list of Oracle procedures/packages
- Package icon (📦) distinguishes packages from standalone procedures
- Click a procedure to display its parameters on the right

### Step 3: Select Equipment Type

Select the equipment type (log type) for mapping.

- **Parsed** (green): VRL parsing is configured — select source fields from dropdown
- **Not parsed** (dashed): VRL not yet configured — cannot be selected

> If no equipment type is selected, source fields must be entered as text manually.

### Step 4: Map Source Fields

#### Table Mode

| Column | Description |
|--------|-------------|
| Column Name | Oracle table column name |
| Type | Data type (VARCHAR2, NUMBER, etc.) |
| Nullable | Whether NULL is allowed |
| Source Field | Select or enter the log field to map |
| Required | Whether required for storage (Y/N) |

- **With equipment type**: Select parsed fields from dropdown
- **Without equipment type**: Enter manually in text field (e.g., `log.field_name`)
- Mapped columns show a green check (✓) on the left

#### Procedure Mode

| Column | Description |
|--------|-------------|
| Order | Parameter order |
| Argument | Oracle procedure parameter name |
| Type | Data type |
| Direction | IN / OUT / IN OUT |
| Source Field | Log field to map |
| Required | Whether required |

**Call Mode**:
- **NAMED**: Call by parameter name — standard procedure call
- **ARRAY**: Pass as array — requires Oracle Collection type name

### Step 5: Auto Map (Optional)

Click the **Auto Map** button to automatically match columns with source fields that have matching names.

- Example: Oracle column `INSPECTOR` → Source field `data.INSPECTOR` auto-matched
- You can manually adjust after auto-mapping

### Step 6: Save

Click **Save Mapping** to save the configuration.

## Parse Rule Editor

Click the **Edit Parse Rules** button on the mapping screen to open the modal.

### VRL Sync

- Click **Sync VRL** to auto-extract `.data.*` fields from the aggregator.toml VRL code
- Extracted fields are reflected in the dropdown list
- Available fields vary by equipment type

### Manual Field Addition

- Enter a field name and click **Add**
- The `data.` prefix is added automatically
- Unnecessary fields can be deleted
