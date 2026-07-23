# Clickfuse — 60–90s cold open

Frozen sentence: *payment-service v2.4.1 at 14:32 changed retry timeout 3s→15s; checkout p95 spiked ~2.6×; payment ranked #1.*

## Script

1. **Ask** (chat, Trigger live): “Why did checkout latency spike after the 14:32 deploy?”
2. **Trigger run** — open the `incident-agent` run. Point at the child **`query-latency`** `schemaTask` (`triggerAndWait`). That run id is stamped on the Timeline evidence drawer (`run …`).
3. **Board** — Timeline fills from that task output (anomaly band + deploy marker). Heatmap → payment hotspot; Diff → ~8.3× payment; Suspects → payment #1.
4. **Evidence drawer** (Timeline) — show SQL: raw `http_logs` anomaly band **and** `quantileMerge` against `latency_rollup_1m` (AggregatingMergeTree State/Merge). Note soft-fails if rollup empty.
5. **query_log** (live CH only) — in ClickHouse, recent Select rows for `http_logs` / `latency_rollup_1m` prove the queries actually ran.
6. **Verdict** — roll back v2.4.1 or restore 3s timeout.

## Fixture fallback

If Trigger/CH credentials are missing: **Render fixture board**. Same story numbers (2.6×, payment #1, rollup SQL in evidence). No live run id / query_log until env is configured.

## Public demo URL

Not published from this pass (no Vercel/Trigger deploy credentials in workspace). Manual:

```bash
# .env.local — see .env.example
pnpm install --ignore-workspace
pnpm seed:clickhouse   # after schema applied
pnpm trigger:dev       # or trigger:deploy
NEXT_PUBLIC_TRIGGER_CHAT_ENABLED=true pnpm dev
# Optional: vercel --prod once CH + TRIGGER_* + OPENAI_API_KEY are set on the project
```

Then paste the public URL into README.
