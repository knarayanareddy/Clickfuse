# Why Was It Slow? — Demo Script

Target length: 3:45-4:30. The demo opens with the working product, not slides.

## Demo sentence

The agent found that the 14:32 payment deploy changed retry behavior, causing checkout latency to spike, and every visual is backed by ClickHouse evidence.

## Timed walkthrough

### 0:00-0:15 — Open with the product

Open the app on the chat screen. Type:

> Why did checkout latency spike after the 14:32 deploy?

Narration:

> This is an incident investigation chat agent. The answer is not a paragraph. It builds an evidence-backed proof board.

### 0:15-0:45 — Progressive board assembly

The board skeleton appears immediately. Cards fill in one by one as Trigger.dev emits progress and data parts.

Visual beats:

- skeleton board appears
- timeline slot starts loading
- latency timeline fades in
- anomaly band is visible
- deploy marker lands at 14:32

Narration:

> The board assembles as the agent investigates. First it queries latency from ClickHouse, computes the normal range, and marks where latency exits that range.

### 0:45-1:10 — Timeline evidence

Click `Show evidence` on the timeline card.

Show:

- ClickHouse SQL
- row count
- time window
- schemaTask name and duration, if available

Narration:

> Every visual can show the ClickHouse query behind it. This timeline is generated from real query results, not hardcoded chart data.

### 1:10-1:45 — Heatmap and service focus

The service heatmap fills in. `payment-service` is visibly red; inventory and shipping stay neutral.

Click `payment-service` in the heatmap.

Visual beats:

- selected service highlights across the board
- timeline/diff/suspect ladder emphasize payment-service
- reset option remains visible

Narration:

> The response is explorable. I can click the hot service and the board focuses on that suspect across the rest of the investigation.

### 1:45-2:20 — Suspect ladder and reasoning

Open the suspect ladder / reasoning trace.

Expected ranked suspects:

1. `payment-service` — confirmed/high confidence
2. `retry-worker` — supporting symptom
3. `checkout-api` — mild upstream amplification
4. `inventory-api` and `shipping-api` — ruled out/normal

Narration:

> The agent is not just summarizing. It ranks hypotheses and shows why payment-service wins while the other services are ruled out.

### 2:20-2:55 — Before/after diff

Show the before/after diff card.

Expected story:

- before deploy: payment spans normal
- after deploy: payment spans 8x or more slower
- peers remain near baseline

Narration:

> The key view is what changed. Payment-service is dramatically slower after the deploy, while the rest of the system stays flat.

### 2:55-3:20 — Error budget and impact

Show the error budget gauge.

Expected story:

- weekly latency budget partially consumed
- burn rate is critical
- if continued, budget exhaustion estimate is alarming

Narration:

> The agent also translates the incident into SRE impact: how much reliability budget this burned and how urgent it is.

### 3:20-3:45 — Verdict and action

Show the verdict card.

Expected verdict:

> Root cause: payment-service deploy v2.4.1 changed retry timeout from 3s to 15s, causing retry amplification and checkout latency.

Expected action:

> Roll back or reduce retry timeout, then monitor payment-service spans and checkout p95.

Narration:

> The final answer is a compact root-cause card with a recommended next step. The text is garnish; the proof board is the answer.

### 3:45-4:15 — Platform proof

Switch to Trigger.dev dashboard and ClickHouse console/query log.

Show:

- Trigger.dev `chat.agent()` run
- named schemaTask spans: `query-latency`, `query-heatmap`, `rank-suspects`, `query-diff`, `calculate-error-budget`
- prompt/model telemetry if available
- ClickHouse `system.query_log` rows for `http_logs` / `span_logs`

Narration:

> Trigger.dev orchestrates the investigation as durable, observable subtasks. ClickHouse stores and queries the event data; the query log proves the board was generated from real database work.

### 4:15-4:30 — Close

Return to the proof board.

Narration:

> This is beyond a wall of text: a chat agent that turns operational data into an interactive, evidence-backed incident proof board.

## Demo cut rules

- If the run takes too long, pre-warm data and keep narration moving.
- If an advanced SQL query fails, use the fallback query path and do not mention the failed path.
- If the typed Trigger.dev UI builder creates version friction, use manual typed data parts and focus the demo on visible spans.
- Do not add new features after the demo script is recordable.
