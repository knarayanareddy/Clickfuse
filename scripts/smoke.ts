import { existsSync, readFileSync } from "node:fs";
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

const schema = existsSync("clickhouse/schema.sql") ? readFileSync("clickhouse/schema.sql", "utf8") : "";
if (
  schema.includes("AggregatingMergeTree") &&
  schema.includes("quantileState(0.95)") &&
  schema.includes("countState()")
) {
  pass("rollup", "AggregatingMergeTree State/Merge schema present");
} else {
  fail("rollup", "AggregatingMergeTree State/Merge schema missing or incomplete");
}

if (hasClickHouseEnv()) {
  warn("query_log", "live query_log probe is not implemented yet; run the console proof before recording");
} else {
  warn("query_log", "fixture mode: run the app once against ClickHouse before recording to populate system.query_log");
}

const forbiddenTracked = [".env", ".env.local"].filter((file) => existsSync(file));
if (forbiddenTracked.length === 0) {
  pass("secrets", "no local env files found in repo checkout");
} else {
  fail("secrets", `secret-bearing files present: ${forbiddenTracked.join(", ")}`);
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
