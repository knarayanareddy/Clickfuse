# Smoke Checks Design

The fresh project should expose:

```bash
pnpm smoke
```

The goal is not a full test suite. The goal is to catch the failures that would break the demo.

## Expected command behavior

`pnpm smoke` should:

- exit `0` only when the seeded incident story is intact;
- exit non-zero with clear messages when anything important is missing;
- avoid mutating production data;
- be safe to run repeatedly;
- print a compact summary suitable for copy/paste into the README or submission notes.

## Required environment checks

Validate these before running database probes:

- `CLICKHOUSE_HOST`
- `CLICKHOUSE_USERNAME`
- `CLICKHOUSE_PASSWORD`
- `CLICKHOUSE_DATABASE`
- Trigger.dev env vars required by the chosen scaffold
- model provider key, if the agent uses an LLM at runtime

The smoke command should not print secret values.

## Required ClickHouse probes

### 1. Tables exist

Verify:

- `http_logs`
- `span_logs`
- `deploy_events`
- `latency_rollup_1m`

Failure example:

```text
FAIL tables: missing span_logs
```

### 2. Seed rows exist

Expected minimums:

- `http_logs`: enough rows across `14:00-15:00` for every service
- `span_logs`: enough before/after rows for diff
- `deploy_events`: at least one deploy at `14:32`

Failure example:

```text
FAIL seed: expected deploy at 2026-07-22 14:32:00 for payment-service
```

### 3. Deploy marker exists

Expected:

- service: `payment-service`
- version: `v2.4.1`
- deployed_at: `2026-07-22 14:32:00`
- diff mentions retry timeout `3s` to `15s`

### 4. Latency spike is visually obvious

Expected:

- checkout p95 before deploy: about `140-160ms`
- checkout p95 after deploy: at least `2x` baseline
- anomaly threshold crossed after `14:32`

Failure example:

```text
FAIL timeline: post-deploy p95 is only 1.2x baseline; spike will not read visually
```

### 5. Heatmap culprit is unambiguous

Expected:

- `payment-service` has highest post-deploy latency/error intensity
- peers stay close to baseline
- payment-service should be at least `5x` stronger than unaffected peers for visual clarity

### 6. Suspect ranking is correct

Expected top suspect:

```text
payment-service
```

Expected ruled-out services:

```text
inventory-api
shipping-api
```

### 7. Before/after ratio is correct

Expected:

- payment-service average span duration before deploy: about `12ms`
- after deploy: about `100ms`
- ratio: about `8.3x`

Acceptable range:

```text
7.0x <= ratio <= 10.0x
```

### 8. Error budget values are demo-ready

Expected:

- consumed percentage is non-trivial, for example `30-60%`
- burn rate is clearly critical
- exhaustion estimate is alarming but plausible

### 9. Rollup State/Merge works

Verify the `AggregatingMergeTree` path:

- rollup target has rows;
- merge-combinator query returns p95 values;
- values roughly agree with raw-table query.

Failure example:

```text
FAIL rollup: quantileMerge p95 differs from raw query by >20%
```

### 10. system.query_log proof is available

Verify:

- recent queries against `http_logs` or `span_logs` appear in `system.query_log`;
- `query_duration_ms`, `read_rows`, and `result_rows` are available.

If unavailable in the local/dev environment, the smoke command should warn rather than fail:

```text
WARN query_log: no matching recent rows; run the app once before recording the demo
```

## Required app probes

Depending on the final scaffold, keep these lightweight:

- build compiles;
- Trigger.dev task/agent exports are discoverable;
- required task IDs exist:
  - `query-latency`
  - `query-heatmap`
  - `rank-suspects`
  - `query-diff`
  - `calculate-error-budget`
- frontend data-part types match backend emissions.

## Required git/secrets probes

Fail if obvious secrets are tracked or staged:

- `.env`
- `.env.local`
- ClickHouse passwords
- Trigger.dev secret keys
- model provider API keys

Allowed:

- `.env.example`
- redacted demo screenshots/videos

## Suggested output format

```text
Smoke checks

PASS env
PASS tables
PASS seed rows
PASS deploy marker: payment-service v2.4.1 at 14:32
PASS timeline: checkout p95 151ms -> 392ms (2.6x)
PASS heatmap: payment-service is top anomaly
PASS suspects: payment-service ranked #1
PASS diff: payment-service 12ms -> 100ms (8.3x)
PASS error budget: 43% consumed, burn rate 8.3x
PASS rollup: AggregatingMergeTree State/Merge query OK
WARN query_log: run app once before recording to populate query log
PASS secrets

Result: smoke checks passed with warnings
```

## Suggested implementation shape

Use TypeScript for the actual implementation:

```text
scripts/smoke.ts
```

Add to `package.json` in the fresh project:

```json
{
  "scripts": {
    "smoke": "tsx scripts/smoke.ts"
  }
}
```

If avoiding `tsx`, use the Node runtime strategy already used by the project.

## What smoke checks are not

They are not:

- a production test suite;
- load testing;
- synthetic monitoring;
- a replacement for the demo rehearsal.

They are simply the cheapest way to catch the problems that would make the demo look fake, broken, or ambiguous.
