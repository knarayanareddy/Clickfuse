import { clickhouseClient, hasClickHouseEnv } from "./clickhouse.ts";
import { buildIncidentBoard, services } from "./investigation.ts";
import {
  DEPLOY_TIME,
  WINDOW_END,
  WINDOW_START,
  deployQuery,
  diffQuery,
  errorBudgetQuery,
  heatmapQuery,
  timelineQuery
} from "./queries.ts";
import type { DiffRow, HeatmapPart, IncidentBoard, ServiceName, TimelinePoint } from "./types.ts";

type TimelineRow = {
  minute: string;
  service: ServiceName;
  p95_ms: number | string;
  rolling_avg: number | string;
  upper_band: number | string;
  lower_band: number | string;
  is_anomaly: boolean | number | string;
};

type HeatmapRow = {
  service: ServiceName;
  bucket: string;
  intensity: number | string;
};

type DeployRow = {
  service: ServiceName;
  version: string;
  deployed_at: string;
  diff: string;
};

type DiffQueryRow = {
  service: ServiceName;
  before_ms: number | string;
  after_ms: number | string;
  amplification: number | string;
};

type ErrorBudgetRow = {
  consumed_pct: number | string;
  burn_rate: number | string;
  exhaustion_estimate: string;
};

export async function getTimelinePart(): Promise<IncidentBoard["timeline"]> {
  if (!hasClickHouseEnv()) return buildIncidentBoard().timeline;
  const started = performance.now();
  const rows = await queryRows<TimelineRow>(timelineQuery, windowParams());
  return {
    points: rows.map((row) => ({
      minute: normalizeMinute(row.minute),
      service: row.service,
      p95_ms: toNumber(row.p95_ms),
      rolling_avg: toNumber(row.rolling_avg),
      upper_band: toNumber(row.upper_band),
      lower_band: toNumber(row.lower_band),
      is_anomaly: toBoolean(row.is_anomaly)
    })),
    evidence: {
      query: timelineQuery,
      rowCount: rows.length,
      timeWindow: { start: WINDOW_START, end: WINDOW_END },
      confidence: 0.94,
      taskId: "query-latency",
      durationMs: durationSince(started)
    }
  };
}

export async function getHeatmapPart(): Promise<HeatmapPart> {
  if (!hasClickHouseEnv()) return buildIncidentBoard().heatmap;
  const started = performance.now();
  const rows = await queryRows<HeatmapRow>(heatmapQuery, windowParams());
  const times = [...new Set(rows.map((row) => normalizeTime(row.bucket)))].sort();
  const values = Object.fromEntries(services.map((service) => [service, times.map(() => 1)])) as Record<ServiceName, number[]>;

  for (const row of rows) {
    const time = normalizeTime(row.bucket);
    const index = times.indexOf(time);
    if (index >= 0) values[row.service][index] = toNumber(row.intensity);
  }

  return {
    services,
    times,
    values,
    evidence: {
      query: heatmapQuery,
      rowCount: rows.length,
      timeWindow: { start: WINDOW_START, end: WINDOW_END },
      confidence: 0.91,
      taskId: "query-heatmap",
      durationMs: durationSince(started)
    }
  };
}

export async function getDiffPart(): Promise<IncidentBoard["diff"]> {
  if (!hasClickHouseEnv()) return buildIncidentBoard().diff;
  const started = performance.now();
  const rows = await queryRows<DiffQueryRow>(diffQuery, { deployTime: DEPLOY_TIME });
  const diffRows: DiffRow[] = rows.map((row) => ({
    service: row.service,
    before_ms: Math.round(toNumber(row.before_ms)),
    after_ms: Math.round(toNumber(row.after_ms)),
    amplification: toNumber(row.amplification)
  }));

  return {
    rows: diffRows,
    evidence: {
      query: diffQuery,
      rowCount: rows.length,
      timeWindow: { start: WINDOW_START, end: WINDOW_END },
      confidence: 0.95,
      taskId: "query-diff",
      durationMs: durationSince(started)
    }
  };
}

export async function getErrorBudgetPart(): Promise<IncidentBoard["errorBudget"]> {
  if (!hasClickHouseEnv()) return buildIncidentBoard().errorBudget;
  const started = performance.now();
  const [row] = await queryRows<ErrorBudgetRow>(errorBudgetQuery, {
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    deployTime: DEPLOY_TIME
  });

  return {
    consumedPct: Math.round(toNumber(row?.consumed_pct ?? 0)),
    burnRate: toNumber(row?.burn_rate ?? 0),
    exhaustionEstimate: row?.exhaustion_estimate ?? "unknown",
    evidence: {
      query: errorBudgetQuery,
      rowCount: row ? 1 : 0,
      timeWindow: { start: WINDOW_START, end: WINDOW_END },
      confidence: 0.88,
      taskId: "calculate-error-budget",
      durationMs: durationSince(started)
    }
  };
}

export async function getDeployMarker(): Promise<IncidentBoard["deploy"]> {
  if (!hasClickHouseEnv()) return buildIncidentBoard().deploy;
  const [row] = await queryRows<DeployRow>(deployQuery, windowParams());
  if (!row) return buildIncidentBoard().deploy;
  return {
    service: row.service,
    version: row.version,
    deployedAt: normalizeSecond(row.deployed_at),
    diff: row.diff
  };
}

export async function buildLiveIncidentBoard(): Promise<IncidentBoard> {
  if (!hasClickHouseEnv()) return buildIncidentBoard();
  const fixture = buildIncidentBoard();
  const [timeline, heatmap, diff, errorBudget, deploy] = await Promise.all([
    getTimelinePart(),
    getHeatmapPart(),
    getDiffPart(),
    getErrorBudgetPart(),
    getDeployMarker()
  ]);
  const topDiff = diff.rows[0] ?? fixture.diff.rows[0];

  return {
    ...fixture,
    timeline,
    deploy,
    heatmap,
    diff,
    suspects: {
      ...fixture.suspects,
      evidence: {
        ...diff.evidence,
        taskId: "rank-suspects",
        confidence: 0.94
      }
    },
    errorBudget,
    verdict: {
      ...fixture.verdict,
      rootCause: `${topDiff.service} latency amplified ${topDiff.amplification.toFixed(1)}x after ${deploy.version}`,
      evidence: {
        query: `${timeline.evidence.query}\n\n${diff.evidence.query}`,
        rowCount: timeline.evidence.rowCount + diff.evidence.rowCount,
        timeWindow: { start: WINDOW_START, end: WINDOW_END },
        confidence: 0.94,
        taskId: "generate-verdict",
        durationMs: Math.max(timeline.evidence.durationMs ?? 0, diff.evidence.durationMs ?? 0)
      }
    }
  };
}

async function queryRows<T>(query: string, queryParams: Record<string, unknown>) {
  const client = await clickhouseClient();
  try {
    const resultSet = await client.query({
      query,
      format: "JSONEachRow",
      query_params: queryParams
    });
    return await resultSet.json<T>();
  } finally {
    await client.close();
  }
}

function windowParams() {
  return { windowStart: WINDOW_START, windowEnd: WINDOW_END };
}

function toNumber(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value: boolean | number | string) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function durationSince(started: number) {
  return Math.max(1, Math.round(performance.now() - started));
}

function normalizeMinute(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

function normalizeSecond(value: string) {
  return value.replace("T", " ").slice(0, 19);
}

function normalizeTime(value: string) {
  return normalizeMinute(value).slice(11, 16);
}
