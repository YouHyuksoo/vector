# Collector Installation

## Recommended: Agent Manager

1. Download the correct Agent Manager architecture from **Agent Download**.
2. Run it on the equipment PC and open `http://localhost:9090`.
3. Install Vector to `C:\vector` from the management screen.
4. Download the equipment TOML to the same folder.
5. Verify equipment metadata, log paths, and the server address.
6. Start Vector and optionally register it as a Windows service.
7. Confirm the machine is online in **Equipment Dashboard**.

For manual installation, extract `vector.zip` or `vector-x86.zip`, place the TOML beside the executable, and set the sink to `server-ip:6000`. Fluent Bit agents use port 24224.
