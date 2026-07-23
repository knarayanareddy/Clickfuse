import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { incidentCaseFromVerdict } from "../src/lib/incident-case-model.ts";
import { buildIncidentBoard, smokeMetrics } from "../src/lib/investigation.ts";
import { hasClickHouseEnv } from "../src/lib/clickhouse.ts";

type Check = { status: "PASS" | "WARN" | "FAIL"; name: string; detail: string };

const checks: Check[] = [];

function pass(name: string, detail: string) {
  checks.push({ status: "PASS", name, detail });
}

function warn(name: string, detail: string) {
  checks.push({ status: "WARN", name, detail });
}

function fail(name: string, detail: string) {
  checks.push({ status: "FAIL", name, detail });
}

const board = buildIncidentBoard();
const metrics = smokeMetrics();

if (hasClickHouseEnv()) {
  pass("env", "ClickHouse credentials are configured");
} else {
  warn("env", "ClickHouse credentials missing; using deterministic fixture-mode probes");
}

for (const file of ["clickhouse/schema.sql", "clickhouse/queries.sql", "trigger/incident-agent.ts", "scripts/seed-clickhouse.ts"]) {
  if (existsSync(file)) pass("files", `${file} exists`);
  else fail("files", `${file} is missing`);
}

if (
  board.deploy.service === "payment-service" &&
  board.deploy.version === "v2.4.1" &&
  board.deploy.deployedAt === "2026-07-22 14:32:00" &&
  board.deploy.diff.includes("3s") &&
  board.deploy.diff.includes("15s")
) {
  pass("deploy marker", "payment-service v2.4.1 at 14:32 with retry timeout 3s -> 15s");
} else {
  fail("deploy marker", "expected payment-service v2.4.1 at 14:32 with retry timeout 3s -> 15s");
}

if (metrics.spikeRatio >= 2) {
  pass(
    "timeline",
    `checkout p95 ${Math.round(metrics.beforeAvg)}ms -> ${Math.round(metrics.afterAvg)}ms (${metrics.spikeRatio.toFixed(1)}x)`
  );
} else {
  fail("timeline", `post-deploy p95 is only ${metrics.spikeRatio.toFixed(1)}x baseline; spike will not read visually`);
}

if (metrics.heatmapRatio >= 5) {
  pass("heatmap", `payment-service is ${metrics.heatmapRatio.toFixed(1)}x stronger than quiet peers`);
} else {
  fail("heatmap", `payment-service is only ${metrics.heatmapRatio.toFixed(1)}x peers; culprit will not read visually`);
}

if (metrics.topSuspect === "payment-service") {
  pass("suspects", "payment-service ranked #1");
} else {
  fail("suspects", `expected payment-service ranked #1, got ${metrics.topSuspect ?? "none"}`);
}

const ratio = metrics.paymentDiff?.amplification ?? 0;
if (ratio >= 7 && ratio <= 10) {
  pass("diff", `payment-service ${metrics.paymentDiff?.before_ms}ms -> ${metrics.paymentDiff?.after_ms}ms (${ratio.toFixed(1)}x)`);
} else {
  fail("diff", `expected payment-service ratio 7.0x-10.0x, got ${ratio.toFixed(1)}x`);
}

if (metrics.errorBudget.consumedPct >= 30 && metrics.errorBudget.consumedPct <= 60 && metrics.errorBudget.burnRate >= 5) {
  pass("error budget", `${metrics.errorBudget.consumedPct}% consumed, burn rate ${metrics.errorBudget.burnRate}x`);
} else {
  fail("error budget", "budget values are not demo-ready");
}

const incidentCase = incidentCaseFromVerdict(board, new Date("2026-07-22T15:05:00.000Z"));
if (
  incidentCase.status === "open" &&
  incidentCase.assignee === "on-call-sre" &&
  incidentCase.rootCause === board.verdict.rootCause &&
  incidentCase.actionItems.length >= 3 &&
  incidentCase.linkedAnalytics.topSuspect === "payment-service" &&
  incidentCase.linkedAnalytics.evidenceTaskIds.includes("generate-verdict")
) {
  pass("incident case", "verdict can be promoted into an operational incident record linked to analytics evidence");
} else {
  fail("incident case", "promoted incident case is missing status, owner, action items or analytics links");
}

const schema = existsSync("clickhouse/schema.sql") ? readFileSync("clickhouse/schema.sql", "utf8") : "";
const agentSource = existsSync("trigger/incident-agent.ts") ? readFileSync("trigger/incident-agent.ts", "utf8") : "";
const liveClickHouseSource = existsSync("src/lib/live-clickhouse.ts") ? readFileSync("src/lib/live-clickhouse.ts", "utf8") : "";
const queriesSource = existsSync("src/lib/queries.ts") ? readFileSync("src/lib/queries.ts", "utf8") : "";
if (
  schema.includes("AggregatingMergeTree") &&
  schema.includes("quantileState(0.95)") &&
  schema.includes("countState()") &&
  queriesSource.includes("quantileMerge(0.95)") &&
  queriesSource.includes("latency_rollup_1m") &&
  liveClickHouseSource.includes("getRollupEvidence") &&
  board.timeline.evidence.query.includes("quantileMerge")
) {
  pass("rollup", "AggregatingMergeTree State/Merge schema + quantileMerge evidence path present");
} else {
  fail("rollup", "AggregatingMergeTree State/Merge schema or quantileMerge evidence path missing");
}

if (
  !agentSource.includes("@ts-nocheck") &&
  agentSource.includes("prompts.define") &&
  agentSource.includes("chat.local<") &&
  agentSource.includes("ai.toolExecute") &&
  agentSource.includes("streamText") &&
  agentSource.includes("buildLiveIncidentBoard") &&
  agentSource.includes("queryLatencyTask.triggerAndWait")
) {
  pass(
    "trigger agent",
    "live agent uses prompts.define, chat.local, ai.toolExecute, streamText, and queryLatencyTask.triggerAndWait without @ts-nocheck"
  );
} else {
  fail("trigger agent", "expected typed Trigger.dev live-agent wiring is incomplete");
}

if (
  liveClickHouseSource.includes("client.query") &&
  liveClickHouseSource.includes("query_params") &&
  liveClickHouseSource.includes("timelineQuery") &&
  liveClickHouseSource.includes("diffQuery") &&
  liveClickHouseSource.includes("rollupQuery")
) {
  pass("live ClickHouse", "live task path executes parameterized ClickHouse timeline/diff/rollup queries");
} else {
  fail("live ClickHouse", "expected live parameterized ClickHouse task path is missing");
}

if (hasClickHouseEnv()) {
  warn("query_log", "live query_log probe is not implemented yet; run the console proof before recording");
} else {
  warn("query_log", "fixture mode: run the app once against ClickHouse before recording to populate system.query_log");
}

const forbiddenTracked = trackedFiles([".env", ".env.local"]);
if (forbiddenTracked.length === 0) {
  pass("secrets", "no secret-bearing env files are tracked or staged");
} else {
  fail("secrets", `secret-bearing files are tracked or staged: ${forbiddenTracked.join(", ")}`);
}

console.log("Smoke checks\n");
for (const check of checks) {
  console.log(`${check.status} ${check.name}: ${check.detail}`);
}

const failures = checks.filter((check) => check.status === "FAIL");
const warnings = checks.filter((check) => check.status === "WARN");

console.log("");
if (failures.length > 0) {
  console.log(`Result: smoke checks failed (${failures.length} failure${failures.length === 1 ? "" : "s"})`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.log(`Result: smoke checks passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`);
} else {
  console.log("Result: smoke checks passed");
}

function trackedFiles(files: string[]) {
  try {
    const output = execFileSync("git", ["ls-files", "--cached", "--", ...files], { encoding: "utf8" });
    return output.split("\n").filter(Boolean);
  } catch {
    return files.filter((file) => existsSync(file));
  }
}
