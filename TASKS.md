# Why Was It Slow? — Task Plan

Methodology: demo-first, spec-anchored, agent-assisted, smoke-tested.

Before each implementation task, reread `SPEC.md`. Each task must end with one visible or verifiable milestone.

## Phase 0 — Story lock

- [ ] Create `demo-script.md`
- [ ] Create `SPEC.md`
- [ ] Create `TASKS.md`
- [ ] Create smoke-check design
- [ ] Finalize the one-sentence demo story
- [ ] Confirm the frozen board layout

Exit criteria:

- The demo can be described in one sentence.
- Every planned feature has a moment in the demo script.
- Anything not in the spec is out of scope.

## Phase 1 — Data first

### T1 — Verify Trigger.dev API surface

- [ ] Install/scaffold with the intended Trigger.dev SDK version
- [ ] Verify `chat.agent()` imports
- [ ] Verify `schemaTask` imports
- [ ] Verify AI tool wrapping API, such as `ai.tool(...)` / available equivalent
- [ ] Try typed UI builder API once, if available

Timeout rules:

- `schemaTask` / AI tool wrapping API verification: 15 minutes
- typed UI builder: one clean attempt only

Fallbacks:

- If task-tool wrapping is unavailable, use direct tool execution inside `chat.agent()`.
- If typed UI builder is unavailable, use local TS types and runtime guards.

### T2 — ClickHouse schema

- [ ] Create `http_logs`
- [ ] Create `span_logs`
- [ ] Create `deploy_events`
- [ ] Create `latency_rollup_1m`
- [ ] Create `mv_latency_rollup_1m`
- [ ] Confirm `AggregatingMergeTree` State/Merge query works

Exit criteria:

- Tables exist.
- Rollup query using merge combinators returns rows.

### T3 — Seed data

- [ ] Seed normal traffic before 14:32
- [ ] Seed deploy at exactly 14:32
- [ ] Seed post-deploy checkout latency spike
- [ ] Seed payment-service span amplification
- [ ] Seed flat peer services
- [ ] Seed enough rows per minute to make charts visually obvious

Exit criteria:

- Spike is at least 2x baseline.
- Payment-service is clearly red.
- Other services are gray/green.

### T4 — Query probes

- [ ] Probe deploy event at 14:32
- [ ] Probe timeline/anomaly query
- [ ] Probe heatmap aggregation
- [ ] Probe before/after diff
- [ ] Probe suspect ranking
- [ ] Probe error budget values
- [ ] Probe `system.query_log`

Timeout rule:

- Window-function anomaly query: 30 minutes max before fallback.

Exit criteria:

- One command or notes file proves the data story works before UI begins.

## Phase 2 — App skeleton

### T5 — Scaffold app

- [ ] Create Next.js app
- [ ] Add Tailwind/shadcn-style styling
- [ ] Add Trigger.dev configuration
- [ ] Add ClickHouse client helper
- [ ] Add env var validation

Exit criteria:

- App starts locally.
- Trigger.dev dev mode can see exported tasks/agent.

### T6 — Chat shell

- [ ] Implement `ChatShell`
- [ ] Wire `useTriggerChatTransport`
- [ ] Add input bar and message list
- [ ] Confirm one test message reaches `chat.agent()`

Exit criteria:

- User can send the incident question and receive a basic response.

### T7 — Static board skeleton

- [ ] Implement `IncidentBoard`
- [ ] Implement `BoardSkeleton`
- [ ] Render the frozen layout with fake static data

Exit criteria:

- Board layout looks clean and not overcrowded.

## Phase 3 — Real data panels

### T8 — query-latency + TimelineCard

- [ ] Implement `query-latency` as `schemaTask` if supported
- [ ] Query ClickHouse for timeline data
- [ ] Include anomaly band in this first timeline implementation
- [ ] Include deploy marker if already available, or accept marker later
- [ ] Emit timeline data part
- [ ] Render `TimelineCard`
- [ ] Add `EvidenceDrawer`

Exit criteria:

- Timeline shows normal band broken after 14:32.

### T9 — query-heatmap + HeatmapCard

- [ ] Implement `query-heatmap`
- [ ] Emit heatmap data part
- [ ] Render CSS grid heatmap
- [ ] Make payment-service visibly red
- [ ] Add evidence drawer

Exit criteria:

- Heatmap identifies payment-service at a glance.

### T10 — click-to-focus interaction

- [ ] Click heatmap service to select it
- [ ] Highlight selected service across board
- [ ] Add reset to all services
- [ ] Keep state client-side for MVP

Exit criteria:

- The board is visibly explorable, not just static.

### T11 — query-deploy-events + deploy marker

- [ ] Query deploy event
- [ ] Render marker on timeline
- [ ] Render deploy details/diff
- [ ] Add evidence drawer

Exit criteria:

- Deploy aligns with the latency spike.

### T12 — rank-suspects + SuspectLadderCard

- [ ] Implement suspect ranking query/logic
- [ ] Emit suspect ladder data part
- [ ] Render supporting and contradicting signals
- [ ] Add reasoning trace expander
- [ ] Add evidence drawer

Exit criteria:

- payment-service is ranked first and peers are ruled out.

### T13 — query-diff + DiffCard

- [ ] Implement before/after CTE query
- [ ] Emit diff data part
- [ ] Render before/after bars
- [ ] Highlight payment-service
- [ ] Add evidence drawer

Exit criteria:

- payment-service shows about 8.3x amplification.

### T14 — calculate-error-budget + ErrorBudgetCard

- [ ] Implement error budget query
- [ ] Emit error budget data part
- [ ] Render budget progress/gauge
- [ ] Add burn-rate label
- [ ] Add evidence drawer

Exit criteria:

- The board answers "how bad is this?"

### T15 — VerdictCard

- [ ] Aggregate findings from investigation state
- [ ] Emit verdict data part
- [ ] Render root cause, confidence, signals, and recommended action
- [ ] Add evidence drawer

Exit criteria:

- Verdict names retry timeout change as root cause.

## Phase 4 — Experience and trust

### T16 — Progressive assembly

- [ ] Emit transient progress parts
- [ ] Fill skeleton slots as data arrives
- [ ] Add subtle fade-in animations

Exit criteria:

- Demo feels like watching the investigation happen.

### T17 — Trigger.dev telemetry polish

- [ ] Wire `prompts.define()` / `chat.prompt.set()`
- [ ] Ensure named task spans are readable in dashboard
- [ ] Include useful metadata on tasks
- [ ] Confirm prompt/model telemetry if available

Exit criteria:

- Dashboard proof moment is demo-ready.

### T18 — Message validation

- [ ] Add timestamp/deploy-reference validation if supported cleanly
- [ ] Friendly error for vague question

Exit criteria:

- Vague prompt fails gracefully or asks for a timestamp.

### T19 — Error states

- [ ] No data found
- [ ] Deploy missing
- [ ] Flat latency/no anomaly
- [ ] ClickHouse query failure
- [ ] Trigger.dev task failure

Exit criteria:

- Main demo path remains stable; obvious failures do not blank the UI.

### T20 — Smoke command

- [ ] Implement `pnpm smoke`
- [ ] Verify data-story probes
- [ ] Verify env vars
- [ ] Verify no secrets are tracked
- [ ] Make failures human-readable

Exit criteria:

- One command catches the common demo-breaking problems.

## Phase 5 — Submission

### T21 — README

- [ ] Product pitch
- [ ] Architecture diagram
- [ ] How ClickHouse is used
- [ ] How Trigger.dev is used
- [ ] Setup instructions
- [ ] Seed data instructions
- [ ] Demo script
- [ ] Limitations
- [ ] License

### T22 — Demo rehearsal

- [ ] Run the script end-to-end
- [ ] Time each segment
- [ ] Confirm board loads fast enough
- [ ] Confirm Trigger.dev dashboard proof moment
- [ ] Confirm `system.query_log` proof moment

### T23 — Final checks

- [ ] `pnpm install`
- [ ] `pnpm build`
- [ ] `pnpm smoke`
- [ ] git status clean except intended files
- [ ] no secrets in git

### T24 — Record and submit

- [ ] Record demo video
- [ ] Push public GitHub repo
- [ ] Confirm permissive license
- [ ] Submit before deadline

## Feature-freeze rule

At hour 30, stop adding features. After that, only:

- bug fixes
- smoke checks
- README
- demo recording
- submission packaging
