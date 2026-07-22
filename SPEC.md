# Why Was It Slow? — Living Specification

## Product thesis

A chat agent that assembles an evidence-backed root-cause proof board when asked why checkout latency spiked after a deploy.

The product is not a general dashboard and not a generic chat-with-data app. The chat input starts an investigation; the response is the visual, interactive artifact.

## Demo sentence

The agent found that the 14:32 payment deploy changed retry behavior, causing checkout latency to spike, and every visual is backed by ClickHouse evidence.

## Constraints

- Build one strong incident story, not an open-ended observability platform.
- ClickHouse is the primary data layer.
- Trigger.dev `chat.agent()` orchestrates the investigation.
- Every visible conclusion must map back to ClickHouse evidence.
- Keep dependencies minimal.
- Freeze features at hour 30; after that, only bug fixes, smoke checks, README, video, and submission.

## Final board layout

```text
Incident Proof Board

[ Timeline with anomaly band + deploy marker ]

[ Service heatmap ]       [ Before/after diff ]

[ Suspect ladder ]        [ Error budget ]

[ Verdict + action ]

Each panel:
  Show evidence -> SQL + row count + time window + confidence + Trigger.dev task/span context
```

## Required user interaction

The board must be explorable with one data-level interaction:

- click a service in the heatmap;
- selected service is highlighted across the board;
- timeline, diff card, and suspect ladder emphasize that service;
- `All services` resets the board.

Evidence drawers also count as trust interaction, but not as the main exploratory interaction.

## Seeded incident story

The seed data is the first-class product. It must create an obvious visual narrative.

Incident:

- window: `2026-07-22 14:00:00` to `2026-07-22 15:00:00`
- deploy time: `2026-07-22 14:32:00`
- deploy: `payment-service` version `v2.4.1`
- config diff: retry timeout changed from `3s` to `15s`

Expected data shape:

- checkout p95 baseline before deploy: about `150ms`
- checkout p95 after deploy: at least `350ms`, preferably `380-450ms`
- payment-service spans before deploy: about `12ms` average
- payment-service spans after deploy: about `100ms` average or higher
- amplification: about `8.3x`
- inventory and shipping remain close to `0.9x-1.1x`
- checkout-api shows mild upstream amplification only
- payment-service is bright red in heatmap
- peers are gray/green
- latency anomaly is visually obvious, at least `2x` baseline

## ClickHouse schema

### Raw HTTP logs

```sql
CREATE TABLE http_logs
(
    ts DateTime64(3),
    request_id String,
    service LowCardinality(String),
    endpoint LowCardinality(String),
    status UInt16,
    latency_ms UInt32
)
ENGINE = MergeTree()
ORDER BY (service, endpoint, ts);
```

### Distributed trace spans

```sql
CREATE TABLE span_logs
(
    ts DateTime64(3),
    trace_id String,
    span_id String,
    parent_span_id String,
    service LowCardinality(String),
    operation String,
    duration_ms UInt32,
    status LowCardinality(String)
)
ENGINE = MergeTree()
ORDER BY (service, ts, trace_id);
```

### Deploy events

```sql
CREATE TABLE deploy_events
(
    deployed_at DateTime64(3),
    service LowCardinality(String),
    version String,
    diff String
)
ENGINE = MergeTree()
ORDER BY (service, deployed_at);
```

### Rollup target using AggregatingMergeTree

This is the ClickHouse depth signal. Raw rows feed a materialized view that stores aggregate states; dashboard queries finalize those states with merge combinators.

```sql
CREATE TABLE latency_rollup_1m
(
    minute DateTime,
    service LowCardinality(String),
    endpoint LowCardinality(String),
    p50_state AggregateFunction(quantile(0.5), UInt32),
    p95_state AggregateFunction(quantile(0.95), UInt32),
    p99_state AggregateFunction(quantile(0.99), UInt32),
    error_count_state AggregateFunction(sum, UInt64),
    request_count_state AggregateFunction(count)
)
ENGINE = AggregatingMergeTree()
ORDER BY (service, endpoint, minute);
```

```sql
CREATE MATERIALIZED VIEW mv_latency_rollup_1m
TO latency_rollup_1m
AS SELECT
    toStartOfMinute(ts) AS minute,
    service,
    endpoint,
    quantileState(0.5)(latency_ms) AS p50_state,
    quantileState(0.95)(latency_ms) AS p95_state,
    quantileState(0.99)(latency_ms) AS p99_state,
    sumState(toUInt64(status >= 500)) AS error_count_state,
    countState() AS request_count_state
FROM http_logs
GROUP BY minute, service, endpoint;
```

Example merge query:

```sql
SELECT
    minute,
    service,
    endpoint,
    quantileMerge(0.5)(p50_state) AS p50_ms,
    quantileMerge(0.95)(p95_state) AS p95_ms,
    quantileMerge(0.99)(p99_state) AS p99_ms,
    sumMerge(error_count_state) AS errors,
    countMerge(request_count_state) AS requests
FROM latency_rollup_1m
WHERE minute BETWEEN {windowStart:DateTime} AND {windowEnd:DateTime}
GROUP BY minute, service, endpoint
ORDER BY minute, service, endpoint;
```

## Query strategy

### Timeline and anomaly band

Preferred path: compute rolling anomaly bands in ClickHouse with window functions.

Timeout rule: if the window-function query is not correct within 30 minutes, fall back to simpler baseline computation.

Preferred query shape:

```sql
WITH buckets AS (
    SELECT
        toStartOfMinute(ts) AS minute,
        service,
        quantile(0.95)(latency_ms) AS p95_ms
    FROM http_logs
    WHERE ts BETWEEN {windowStart:DateTime} AND {windowEnd:DateTime}
    GROUP BY minute, service
),
baselines AS (
    SELECT
        minute,
        service,
        p95_ms,
        avg(p95_ms) OVER (
            PARTITION BY service
            ORDER BY minute
            ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING
        ) AS rolling_avg,
        stddevPop(p95_ms) OVER (
            PARTITION BY service
            ORDER BY minute
            ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING
        ) AS rolling_stddev
    FROM buckets
)
SELECT
    minute,
    service,
    p95_ms,
    rolling_avg,
    rolling_avg + 3 * rolling_stddev AS upper_band,
    rolling_avg - 3 * rolling_stddev AS lower_band,
    p95_ms > rolling_avg + 3 * rolling_stddev AS is_anomaly
FROM baselines
WHERE rolling_avg IS NOT NULL
ORDER BY minute, service;
```

### Before/after diff

Use one CTE query rather than two queries merged in JavaScript when practical.

```sql
WITH baseline AS (
    SELECT service, avg(duration_ms) AS avg_ms
    FROM span_logs
    WHERE ts >= {deployTime:DateTime} - INTERVAL 30 MINUTE
      AND ts < {deployTime:DateTime}
    GROUP BY service
),
incident AS (
    SELECT service, avg(duration_ms) AS avg_ms
    FROM span_logs
    WHERE ts >= {deployTime:DateTime}
      AND ts < {deployTime:DateTime} + INTERVAL 30 MINUTE
    GROUP BY service
)
SELECT
    baseline.service AS service,
    baseline.avg_ms AS before_ms,
    incident.avg_ms AS after_ms,
    round(incident.avg_ms / baseline.avg_ms, 1) AS amplification
FROM baseline
LEFT JOIN incident USING (service)
ORDER BY amplification DESC;
```

### system.query_log demo proof

Demo query:

```sql
SELECT
    event_time,
    query_duration_ms,
    read_rows,
    result_rows,
    query
FROM system.query_log
WHERE type = 'QueryFinish'
  AND event_time >= now() - INTERVAL 1 HOUR
  AND query_kind = 'Select'
  AND (
      query LIKE '%http_logs%'
      OR query LIKE '%span_logs%'
      OR query LIKE '%latency_rollup_1m%'
      OR query LIKE '%deploy_events%'
  )
ORDER BY event_time DESC
LIMIT 5;
```

Before recording, run the incident question once to populate `system.query_log`. If table-name filtering differs in the deployed environment, use the same time-based filter and sort by recent `Select` queries from the demo session rather than relying on exact query text.

## ClickHouse safety

All agent-executed query paths should use read-only settings:

- `readonly=2`
- a sane row limit, for example `max_result_rows=1000`
- parameterized values/query params where supported
- no arbitrary user-supplied table names in the MVP

Demo narration should explain that `readonly=2` prevents the agent from modifying production data.

## Trigger.dev architecture

### Core primitives

- `chat.agent()` is the main orchestration primitive.
- `chat.local` stores investigation state across the turn/session.
- `prompts.define()` and `chat.prompt.set()` provide versioned prompt telemetry.
- `chat.response.write` emits progress and persistent data parts.
- `useTriggerChatTransport` connects the frontend directly to the agent.

### Durable query tasks

Use `schemaTask` / Trigger.dev AI tool wrapping for major ClickHouse-backed tools if the installed SDK supports the imports cleanly.

API verification timeout: 15 minutes. If imports or method names fight, fall back to direct tool execution inside `chat.agent()` and keep the demo moving.

Target named tasks:

- `query-latency`
- `query-heatmap`
- `rank-suspects`
- `query-diff`
- `calculate-error-budget`
- optional `query-deploy-events`

Each task should attach metadata where practical:

- query label
- row count
- duration
- selected service, if any
- ClickHouse table(s)

Evidence drawers should include the relevant task name/span context when available.

### Typed UI parts

Try `chat.withUIMessage<IncidentUIMessage>()` once. If it compiles cleanly, use it. If the SDK version creates friction, use local TypeScript types and runtime guards in the frontend.

Required data part shapes:

```ts
type ProgressPart = {
  step: string;
  status: "queued" | "running" | "complete" | "failed";
  transient?: true;
};

type TimelinePart = {
  points: Array<{
    minute: string;
    service: string;
    p95_ms: number;
    rolling_avg?: number;
    upper_band?: number;
    lower_band?: number;
    is_anomaly: boolean;
  }>;
  deployMarker?: DeployMarker;
  evidence: Evidence;
};

type HeatmapPart = {
  services: string[];
  times: string[];
  values: number[][];
  evidence: Evidence;
};

type DiffPart = {
  rows: Array<{
    service: string;
    before_ms: number;
    after_ms: number;
    amplification: number;
  }>;
  evidence: Evidence;
};

type SuspectPart = {
  suspects: Array<{
    service: string;
    rank: number;
    confidence: number;
    status: "confirmed" | "supporting" | "weakened" | "ruled_out";
    supportingSignals: string[];
    contradictingSignals: string[];
  }>;
  reasoning: Array<{
    step: number;
    action: string;
    finding: string;
    confidence: number;
  }>;
  evidence: Evidence;
};

type ErrorBudgetPart = {
  consumedPct: number;
  burnRate: number;
  exhaustionEstimate: string;
  evidence: Evidence;
};

type VerdictPart = {
  rootCause: string;
  confidence: number;
  signals: string[];
  recommendedAction: string;
  evidence: Evidence;
};

type Evidence = {
  query: string;
  rowCount: number;
  timeWindow: { start: string; end: string };
  confidence: number;
  taskId?: string;
  durationMs?: number;
};

type DeployMarker = {
  service: string;
  version: string;
  deployedAt: string;
  diff: string;
};
```

## React component tree

- `ChatShell`
  - chat input
  - message list
  - Trigger.dev transport
- `IncidentBoard`
  - receives streaming parts
  - owns selected service state
  - renders skeleton slots until parts arrive
- `BoardSkeleton`
- `TimelineCard`
  - Recharts line chart
  - anomaly band
  - deploy marker
- `HeatmapCard`
  - CSS grid color scale
  - clickable service rows/cells
- `DiffCard`
  - before/after service bars
- `SuspectLadderCard`
  - ranked suspects
  - reasoning trace expander
- `ErrorBudgetCard`
  - progress/gauge
  - burn-rate label
- `VerdictCard`
  - root cause
  - confidence
  - recommended action
- `EvidenceDrawer`
  - reusable SQL + metadata drawer

## Visual style

- dark developer-tool aesthetic
- red for anomaly/culprit
- amber for warnings/supporting symptoms
- green/gray for normal/ruled-out services
- compact cards with enough whitespace to avoid cockpit overload

## Dependencies

Allowed core dependencies:

- Next.js
- Trigger.dev SDK
- `@clickhouse/client`
- Recharts
- Tailwind/shadcn-style primitives
- Zod

Avoid unless explicitly needed:

- json-render
- Mastra
- CopilotKit
- A2UI/OpenUI
- force graph libraries
- flame graph libraries before the rest of the demo works

## Smoke-check contract

Expose one command in the fresh project:

```bash
pnpm smoke
```

It should verify:

- required env vars are present
- tables exist
- seed rows exist
- deploy exists at `14:32`
- latency spike crosses anomaly threshold
- payment-service is top suspect
- before/after ratio is about `8.3x`
- error budget values are in expected range
- no obvious secrets are staged/tracked

## Feature freeze

At hour 30:

- no new panels
- no new Trigger.dev APIs
- no new ClickHouse features
- no new chart libraries
- only bug fixes, smoke checks, README, demo recording, and submission
