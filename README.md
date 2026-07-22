# Clickfuse

Clickfuse is a Build Week prototype for the ClickHouse + Trigger.dev hackathon. It answers one SRE question:

> “Why did checkout latency spike after the 14:32 deploy?”

Instead of returning a paragraph, it builds an evidence-backed incident board: anomaly timeline, service heatmap, before/after diff, suspect ladder, error-budget impact and a verdict card. Each panel has a “Show evidence” drawer with the ClickHouse query/window that produced it.

## What is implemented

- Next.js incident board UI with progressive skeleton assembly.
- Deterministic fixture-mode investigation data for offline judging.
- ClickHouse schema with `MergeTree` source tables and an `AggregatingMergeTree` rollup using `quantileState`, `sumState` and `countState`.
- Window-function anomaly SQL and before/after span diff SQL.
- Seed script for the demo incident: `payment-service` v2.4.1 changes retry timeout from `3s` to `15s` at `14:32`.
- Trigger.dev task/agent scaffold with durable query tasks and typed board parts.
- `pnpm smoke` checks that the demo story is visually obvious before recording.

## Quick start

```bash
pnpm install
pnpm smoke
pnpm dev
```

Open the local Next.js URL and ask:

```text
Why did checkout latency spike after the 14:32 deploy?
```

The app works in fixture mode without ClickHouse credentials so judges can inspect the product offline.

## Live ClickHouse setup

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Set:

```bash
CLICKHOUSE_HOST=
CLICKHOUSE_USERNAME=
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=
```

Then create tables and seed the incident:

```bash
clickhouse client --queries-file clickhouse/schema.sql
pnpm seed:clickhouse
pnpm smoke
```

The ClickHouse client is configured with `readonly=2` for query execution paths. The seed script is intentionally separate and should only run against a demo database.

## Trigger.dev

The Trigger.dev scaffold lives in `trigger/incident-agent.ts`.

It models the investigation as separate schema tasks:

- `query-latency`
- `query-heatmap`
- `query-diff`
- `rank-suspects`
- `calculate-error-budget`

Those tasks are the intended observability units in the Trigger.dev run trace. The demo should show the run trace after the board completes to prove orchestration, timings and task boundaries.

## Smoke checks

```bash
pnpm smoke
```

The smoke suite checks:

- schema/query files exist;
- the 14:32 deploy marker is present;
- checkout latency spikes at least 2x baseline;
- `payment-service` is visually dominant in the heatmap;
- `payment-service` is the top suspect;
- before/after diff shows a 7–10x payment span amplification;
- error-budget burn is demo-visible;
- the AggregatingMergeTree State/Merge pattern is present;
- local secret files are not present.

Warnings are acceptable in offline fixture mode. Failures mean the demo story is not strong enough to record.

## Demo narrative

The frozen demo sentence is:

> The agent found that the 14:32 payment deploy changed retry behavior, causing checkout latency to spike, and every visual is backed by ClickHouse evidence.

Suggested flow:

1. Ask the incident question.
2. Watch the board assemble.
3. Point to the anomaly band breaking at 14:32.
4. Open an evidence drawer and show the SQL.
5. Click `payment-service` in the heatmap.
6. Show the before/after diff and suspect ladder.
7. Show Trigger.dev run traces.
8. Close with the verdict/action card.

## Limitations

This is a bounded Build Week prototype, not a general observability platform. The fixture mode is deterministic by design. The current implementation is optimized for one incident story and one supported board shape. It should not be described as autonomous root-cause proof for arbitrary production systems.
