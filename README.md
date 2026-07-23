# Clickfuse

Clickfuse is a Build Week prototype for the ClickHouse + Trigger.dev hackathon. It answers one SRE question:

> “Why did checkout latency spike after the 14:32 deploy?”

Instead of returning a paragraph, it builds an evidence-backed incident board: anomaly timeline, service heatmap, before/after diff, suspect ladder, error-budget impact and a verdict card. Each panel has a “Show evidence” drawer with the ClickHouse query/window that produced it.

## What is implemented

- Next.js incident board UI with progressive skeleton assembly.
- Deterministic fixture-mode investigation data for offline judging.
- ClickHouse schema with `MergeTree` source tables and an `AggregatingMergeTree` rollup using `quantileState`, `sumState` and `countState`.
- Window-function anomaly SQL, before/after span diff SQL and `quantileMerge` rollup proof against `latency_rollup_1m`.
- Seed script for the demo incident: `payment-service` v2.4.1 changes retry timeout from `3s` to `15s` at `14:32`.
- Trigger.dev chat agent with versioned prompt telemetry, task-backed tools, typed board parts and optional live streaming.
- `pnpm smoke` checks that the demo story is visually obvious before recording.

## Quick start

Public fixture-mode demo:

https://clickfuse.vercel.app

Marketing landing page:

https://clickfuse.vercel.app/landing/index.html

Demo video:

https://youtu.be/CF0X12awlP8

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

## Live Trigger.dev chat mode

Fixture mode is the safe default. For the live demo path, configure Trigger.dev and OpenAI credentials, then opt into the transport:

```bash
TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_ID=
OPENAI_API_KEY=
NEXT_PUBLIC_TRIGGER_CHAT_ENABLED=true
```

Run the Trigger worker and app in separate terminals:

```bash
pnpm trigger:dev
pnpm dev
```

In live mode, the frontend uses `useTriggerChatTransport`, the server mints a session-scoped public access token, and `trigger/incident-agent.ts` returns an AI SDK `streamText()` result. The agent declares five task-backed tools with `ai.toolExecute()`, initializes run-scoped context with `chat.local`, and resolves the `clickfuse-incident-investigator` prompt with `prompts.define()` so the Trigger.dev dashboard can show generation telemetry. The Timeline panel is also sourced from an explicit `queryLatencyTask.triggerAndWait()` call, and the resulting Trigger.dev run id is stamped onto the Timeline evidence drawer.

When ClickHouse credentials are present, those task bodies execute the parameterized SQL in `src/lib/queries.ts` through the readonly ClickHouse client. Without credentials, they fall back to the deterministic fixture board so offline judging still works.

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

The Trigger.dev agent lives in `trigger/incident-agent.ts`.

It models the investigation as separate schema tasks:

- `query-latency`
- `query-heatmap`
- `query-diff`
- `rank-suspects`
- `calculate-error-budget`

Those tasks are the intended observability units in the Trigger.dev run trace. The demo should show the run trace after the board completes to prove orchestration, timings and task boundaries. In fixture mode, the same deterministic `buildIncidentBoard()` data powers the board without requiring credentials; in live mode, `src/lib/live-clickhouse.ts` uses ClickHouse query results for timeline, heatmap, diff, deploy marker and error budget panels.

The Timeline evidence drawer includes both the raw `http_logs` anomaly-band query and a soft-fail AggregatingMergeTree proof query using `quantileMerge` / `countMerge` against `latency_rollup_1m`. If the rollup table is unavailable or empty in a local demo database, the main incident board still renders and the evidence note explains the missing optional proof path.

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
- the AggregatingMergeTree State/Merge schema and `quantileMerge` evidence path are present;
- Trigger.dev live-agent wiring uses `prompts.define`, `chat.local`, `ai.toolExecute`, `queryLatencyTask.triggerAndWait` and `streamText`;
- live ClickHouse task path uses parameterized `client.query` calls for timeline, diff and rollup proof queries;
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

## License

Clickfuse is released under the MIT License. See `LICENSE`.
