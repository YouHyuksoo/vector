# VRL Simulator

## Overview

An integrated environment for developing and testing VRL (Vector Remap Language) parsing code.
Preview parsing results with actual log samples and apply verified code directly to the Aggregator.

## Prerequisites

- Fastify server must be running
- Vector engine (`vector.exe`) must be installed on the server (used for simulation)
- For AI code generation, at least one AI model must be enabled in **Settings > AI Models**

## How to Use

### Step 1: Select Equipment Type

Choose the equipment type to parse at the top.

- SP, SPI, MAOI, AOI, REFLOW, ICT, FCT, BURNIN, HIPOT, EOL, METALMASK, MOUNTER, VISCOSITY
- If VRL code already exists for the selected type, it loads automatically

### Step 2: Prepare Sample Log

Prepare the sample log to parse in the left area.

**Direct input**:
- Paste actual log data into the text area

**File upload**:
- Click **Load file** to load a log file
- Supported formats: `.txt`, `.csv`, `.log`, `.tsv`

### Step 3: Write VRL Code

Write VRL parsing code in the right area.

**Manual example**:
```
lines = split!(.message, ",")
.data.INSPECTOR = get!(lines, [0])
.data.MODEL = get!(lines, [1])
.data.RESULT = get!(lines, [2])
```

**AI auto-generation**:
1. Select the AI model to use (Gemini, Mistral, Claude)
2. Describe parsing rules in natural language
   - e.g., "comma-separated, 1st field is INSPECTOR, 2nd is MODEL, 3rd is RESULT"
3. Click **AI Generate** to auto-generate VRL code
4. Modify the generated code as needed

### Step 4: Run Simulation

Click the **Simulate** button.

- **Success**: Parsed fields and values are displayed in the results area
- **Failure**: VRL syntax or runtime error messages are shown
- Review results and iterate by modifying code and re-running

### Step 5: Apply to TOML

When parsing works correctly, click **Apply to TOML**.

1. VRL code is inserted into the corresponding equipment transform block in aggregator.toml
2. Parse fields are automatically synced to DB (reflected in Target Mapping dropdowns)
3. A Vector restart modal appears

> Always verify with simulation before applying to TOML.

## VRL Code Writing Tips

### CSV format parsing
```
lines = split!(.message, ",")
.data.FIELD1 = get!(lines, [0])
.data.FIELD2 = get!(lines, [1])
```

### Key-value format parsing
```
pairs = split!(.message, ";")
for_each(pairs) -> |_i, pair| {
  kv = split!(pair, "=")
  key = strip_whitespace!(get!(kv, [0]))
  .data = set!(.data, [key], get!(kv, [1]))
}
```

### Fixed-length parsing
```
.data.CODE = slice!(.message, 0, 10)
.data.VALUE = slice!(.message, 10, 20)
```
