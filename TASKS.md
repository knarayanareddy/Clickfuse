# Why Was It Slow? — Task Plan

Methodology: demo-first, spec-anchored, agent-assisted, smoke-tested.

Before each implementation task, reread `SPEC.md`. Each task must end with one visible or verifiable milestone.

## Phase 0 — Story lock

- [x] Create `demo-script.md`
- [x] Create `SPEC.md`
- [x] Create `TASKS.md`
- [x] Create smoke-check design
- [x] Finalize the one-sentence demo story
- [x] Confirm the frozen board layout

Exit criteria:

- The demo can be described in one sentence.
- Every planned feature has a moment in the demo script.
- Anything not in the spec is out of scope.

## Phase 1 — Data first

### T1 — Verify Trigger.dev API surface

- [x] Install/scaffold with the intended Trigger.dev SDK version
- [x] Verify `chat.agent()` imports
- [x] Verify `schemaTask` imports
- [x] Verify AI tool wrapping API, such as `ai.tool(...)` / available equivalent
- [x] Try typed UI builder API once, if available

Timeout rules:

- `schemaTask` / AI tool wrapping API verification: 15 minutes
- typed UI builder: one clean attempt only

Fallbacks:

- If task-tool wrapping is unavailable, use direct tool execution inside `chat.agent()`.
- If typed UI builder is unavailable, use local TS types and runtime guards.

### T2 — ClickHouse schema

- [x] Create `http_logs`
- [x] Create `span_logs`
- [x] Create `deploy_events`
- [x] Create `latency_rollup_1m`
- [x] Create `mv_latency_rollup_1m`
- [x] Confirm `AggregatingMergeTree` State/Merge query works

Exit criteria:

- Tables exist.
- Rollup query using merge combinators returns rows.

### T3 — Seed data

- [x] Seed normal traffic before 14:32
- [x] Seed deploy at exactly 14:32
- [x] Seed post-deploy checkout latency spike
- [x] Seed payment-service span amplification
- [x] Seed flat peer services
- [x] Seed enough rows per minute to make charts visually obvious

Exit criteria:

- Spike is at least 2x baseline.
- Payment-service is clearly red.
- Other services are gray/green.

### T4 — Query probes

- [x] Probe deploy event at 14:32
- [x] Probe timeline/anomaly query
- [x] Probe heatmap aggregation
- [x] Probe before/after diff
- [x] Probe suspect ranking
- [x] Probe error budget values
- [x] Probe `system.query_log`

Timeout rule:

- Window-function anomaly query: 30 minutes max before fallback.

Exit criteria:

- One command or notes file proves the data story works before UI begins.

## Phase 2 — App skeleton

### T5 — Scaffold app

- [x] Create Next.js app
- [x] Add Tailwind/shadcn-style styling
- [x] Add Trigger.dev configuration
- [x] Add ClickHouse client helper
- [x] Add env var validation

Exit criteria:

- App starts locally.
- Trigger.dev dev mode can see exported tasks/agent.

### T6 — Chat shell

- [x] Implement `ChatShell`
- [x] Wire `useTriggerChatTransport`
- [x] Add input bar and message list
- [x] Confirm one test message reaches `chat.agent()`

Exit criteria:

- User can send the incident question and receive a basic response.

### T7 — Static board skeleton

- [x] Implement `IncidentBoard`
- [x] Implement `BoardSkeleton`
- [x] Render the frozen layout with fake static data

Exit criteria:

- Board layout looks clean and not overcrowded.

## Phase 3 — Real data panels

### T8 — query-latency + TimelineCard

- [x] Implement `query-latency` as `schemaTask` if supported
- [x] Query ClickHouse for timeline data
- [x] Include anomaly band in this first timeline implementation
- [x] Include deploy marker if already available, or accept marker later
- [x] Emit timeline data part
- [x] Render `TimelineCard`
- [x] Add `EvidenceDrawer`

Exit criteria:

- Timeline shows normal band broken after 14:32.

### T9 — query-heatmap + HeatmapCard

- [x] Implement `query-heatmap`
- [x] Emit heatmap data part
- [x] Render CSS grid heatmap
- [x] Make payment-service visibly red
- [x] Add evidence drawer

Exit criteria:

- Heatmap identifies payment-service at a glance.

### T10 — click-to-focus interaction

- [x] Click heatmap service to select it
- [x] Highlight selected service across board
- [x] Add reset to all services
- [x] Keep state client-side for MVP

Exit criteria:

- The board is visibly explorable, not just static.

### T11 — query-deploy-events + deploy marker

- [x] Query deploy event
- [x] Render marker on timeline
- [x] Render deploy details/diff
- [x] Add evidence drawer

Exit criteria:

- Deploy aligns with the latency spike.

### T12 — rank-suspects + SuspectLadderCard

- [x] Implement suspect ranking query/logic
- [x] Emit suspect ladder data part
- [x] Render supporting and contradicting signals
- [x] Add reasoning trace expander
- [x] Add evidence drawer

Exit criteria:

- payment-service is ranked first and peers are ruled out.

### T13 — query-diff + DiffCard

- [x] Implement before/after CTE query
- [x] Emit diff data part
- [x] Render before/after bars
- [x] Highlight payment-service
- [x] Add evidence drawer

Exit criteria:

- payment-service shows about 8.3x amplification.

### T14 — calculate-error-budget + ErrorBudgetCard

- [x] Implement error budget query
- [x] Emit error budget data part
- [x] Render budget progress/gauge
- [x] Add burn-rate label
- [x] Add evidence drawer

Exit criteria:

- The board answers "how bad is this?"

### T15 — VerdictCard

- [x] Aggregate findings from investigation state
- [x] Emit verdict data part
- [x] Render root cause, confidence, signals, and recommended action
- [x] Add evidence drawer

Exit criteria:

- Verdict names retry timeout change as root cause.

## Phase 4 — Experience and trust

### T16 — Progressive assembly

- [x] Emit transient progress parts
- [x] Fill skeleton slots as data arrives
- [x] Add subtle fade-in animations

Exit criteria:

- Demo feels like watching the investigation happen.

### T17 — Trigger.dev telemetry polish

- [x] Wire `prompts.define()` / `chat.prompt.set()`
- [x] Ensure named task spans are readable in dashboard
- [x] Include useful metadata on tasks
- [x] Confirm prompt/model telemetry if available

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

- [x] Implement `pnpm smoke`
- [x] Verify data-story probes
- [x] Verify env vars
- [x] Verify no secrets are tracked
- [x] Make failures human-readable

Exit criteria:

- One command catches the common demo-breaking problems.

## Phase 5 — Submission

### T21 — README

- [x] Product pitch
- [x] Architecture diagram
- [x] How ClickHouse is used
- [x] How Trigger.dev is used
- [x] Setup instructions
- [x] Seed data instructions
- [x] Demo script
- [x] Limitations
- [x] License

### T22 — Demo rehearsal

- [x] Run the script end-to-end
- [x] Time each segment
- [x] Confirm board loads fast enough
- [x] Confirm Trigger.dev dashboard proof moment
- [x] Confirm `system.query_log` proof moment

### T23 — Final checks

- [x] `pnpm install`
- [x] `pnpm build`
- [x] `pnpm smoke`
- [ ] git status clean except intended files
- [x] no secrets in git

### T24 — Record and submit

- [x] Record demo video
- [x] Push public GitHub repo
- [x] Confirm permissive license
- [ ] Submit before deadline

## Feature-freeze rule

At hour 30, stop adding features. After that, only:

- bug fixes
- smoke checks
- README
- demo recording
- submission packaging
