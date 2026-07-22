import { clickhouseClient, hasClickHouseEnv } from "../src/lib/clickhouse.ts";
import { services } from "../src/lib/investigation.ts";

const start = new Date("2026-07-22T14:00:00.000Z");
const deployAt = new Date("2026-07-22T14:32:00.000Z");

type HttpRow = {
  ts: string;
  request_id: string;
  service: string;
  endpoint: string;
  status: number;
  latency_ms: number;
};

type SpanRow = {
  ts: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  service: string;
  operation: string;
  duration_ms: number;
  status: string;
};

if (!hasClickHouseEnv()) {
  console.error("CLICKHOUSE_HOST, CLICKHOUSE_USERNAME, CLICKHOUSE_PASSWORD and CLICKHOUSE_DATABASE are required.");
  console.error("For offline judging, use `pnpm smoke` fixture mode instead.");
  process.exit(1);
}

const client = await clickhouseClient({ readonly: false });
const httpRows: HttpRow[] = [];
const spanRows: SpanRow[] = [];

for (let minuteIndex = 0; minuteIndex < 61; minuteIndex += 1) {
  const minute = new Date(start);
  minute.setUTCMinutes(minute.getUTCMinutes() + minuteIndex);
  const afterDeploy = minute >= deployAt;

  for (const service of services) {
    for (let sample = 0; sample < 24; sample += 1) {
      const ts = new Date(minute);
      ts.setUTCSeconds(sample * 2);
      const latency = serviceLatency(service, minuteIndex, sample, afterDeploy);
      const requestId = `${service}-${minuteIndex}-${sample}`;

      httpRows.push({
        ts: formatClickHouseDate(ts),
        request_id: requestId,
        service,
        endpoint: service === "checkout-api" ? "/checkout" : "/rpc",
        status: afterDeploy && service === "checkout-api" && sample % 17 === 0 ? 503 : 200,
        latency_ms: latency
      });

      spanRows.push({
        ts: formatClickHouseDate(ts),
        trace_id: `trace-${minuteIndex}-${sample}`,
        span_id: `${service}-${sample}`,
        parent_span_id: service === "checkout-api" ? "" : `checkout-api-${sample}`,
        service,
        operation: service === "retry-worker" ? "retry charge" : `${service} request`,
        duration_ms: spanDuration(service, sample, afterDeploy),
        status: afterDeploy && service === "retry-worker" && sample % 11 === 0 ? "retrying" : "ok"
      });
    }
  }
}

await client.insert({
  table: "http_logs",
  values: httpRows,
  format: "JSONEachRow"
});

await client.insert({
  table: "span_logs",
  values: spanRows,
  format: "JSONEachRow"
});

await client.insert({
  table: "deploy_events",
  values: [
    {
      deployed_at: "2026-07-22 14:32:00.000",
      service: "payment-service",
      version: "v2.4.1",
      diff: JSON.stringify({ retry_timeout: { before: "3s", after: "15s" } })
    }
  ],
  format: "JSONEachRow"
});

await client.close();

console.log(`Seeded ${httpRows.length} http_logs rows, ${spanRows.length} span_logs rows and one deploy event.`);
console.log("Story check: payment-service v2.4.1 at 14:32 changed retry timeout from 3s to 15s.");

function serviceLatency(service: string, minuteIndex: number, sample: number, afterDeploy: boolean) {
  const jitter = ((minuteIndex + sample) % 7) * 3;
  if (!afterDeploy) return baseLatency(service) + jitter;
  if (service === "checkout-api") return 360 + jitter * 3;
  if (service === "payment-service") return 420 + jitter * 5;
  if (service === "retry-worker") return 380 + jitter * 4;
  return baseLatency(service) + jitter;
}

function spanDuration(service: string, sample: number, afterDeploy: boolean) {
  const jitter = sample % 5;
  if (!afterDeploy) {
    if (service === "payment-service") return 12 + jitter;
    if (service === "retry-worker") return 18 + jitter;
    if (service === "checkout-api") return 38 + jitter;
    if (service === "inventory-api") return 21 + jitter;
    return 24 + jitter;
  }

  if (service === "payment-service") return 100 + jitter * 6;
  if (service === "retry-worker") return 124 + jitter * 7;
  if (service === "checkout-api") return 43 + jitter;
  if (service === "inventory-api") return 19 + jitter;
  return 24 + jitter;
}

function baseLatency(service: string) {
  if (service === "checkout-api") return 151;
  if (service === "payment-service") return 145;
  if (service === "retry-worker") return 138;
  if (service === "inventory-api") return 142;
  return 148;
}

function formatClickHouseDate(date: Date) {
  return date.toISOString().replace("T", " ").replace("Z", "");
}
