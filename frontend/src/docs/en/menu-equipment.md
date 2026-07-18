# Equipment Dashboard

Monitor Agent heartbeat and collection status for every registered machine. Select a card to view equipment metadata, last heartbeat, and processing statistics.

- **Online**: a heartbeat arrived within the configured TTL.
- **Offline**: the heartbeat TTL has expired.
- **Excluded**: raw files and receive logs are retained, but Oracle inserts are skipped.

You can toggle collection exclusion or remove a stale registry entry. A removed machine may register again when its Agent sends another heartbeat.
