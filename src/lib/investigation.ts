import {
  DEPLOY_TIME,
  WINDOW_END,
  WINDOW_START,
  diffQuery,
  errorBudgetQuery,
  heatmapQuery,
  rollupQuery,
  timelineQuery
} from "./queries.ts";
import type { DiffRow, IncidentBoard, ServiceName, TimelinePoint } from "./types.ts";

export const services: ServiceName[] = [
  "checkout-api",
  "payment-service",
  "retry-worker",
  "inventory-api",
  "shipping-api"
];

const minutes = Array.from({ length: 61 }, (_, index) => {
  const date = new Date("2026-07-22T14:00:00.000Z");
  date.setUTCMinutes(date.getUTCMinutes() + index);
  return date.toISOString().slice(0, 16).replace("T", " ");
});

export function buildIncidentBoard(): IncidentBoard {
  const timeline: TimelinePoint[] = minutes.flatMap((minute, index) =>
    services.map((service) => {
      const afterDeploy = minute >= "2026-07-22 14:32";
      const baseline = baselineFor(service);
      const p95 = latencyFor(service, index, afterDeploy);
      return {
        minute,
        service,
        p95_ms: p95,
        rolling_avg: baseline,
        upper_band: Math.round(baseline * 1.18),
        lower_band: Math.round(baseline * 0.82),
        is_anomaly: p95 > baseline * 1.6
      };
    })
  );

  const diffRows: DiffRow[] = [
    { service: "payment-service", before_ms: 12, after_ms: 100, amplification: 8.3 },
    { service: "retry-worker", before_ms: 18, after_ms: 124, amplification: 6.9 },
    { service: "checkout-api", before_ms: 38, after_ms: 43, amplification: 1.1 },
    { service: "inventory-api", before_ms: 21, after_ms: 19, amplification: 0.9 },
    { service: "shipping-api", before_ms: 24, after_ms: 24, amplification: 1.0 }
  ];

  return {
    timeline: {
      points: timeline,
      evidence: {
        query: `${timelineQuery}\n\n-- AggregatingMergeTree rollup proof (quantileMerge)\n${rollupQuery}`,
        rowCount: timeline.length,
        timeWindow: { start: WINDOW_START, end: WINDOW_END },
        confidence: 0.94,
        taskId: "query-latency",
        durationMs: 87,
        note: "fixture: quantileMerge against latency_rollup_1m (AggregatingMergeTree State/Merge)"
      }
    },
    deploy: {
      service: "payment-service",
      version: "v2.4.1",
      deployedAt: DEPLOY_TIME,
      diff: JSON.stringify({ retry_timeout: { before: "3s", after: "15s" } })
    },
    heatmap: {
      services,
      times: ["14:00", "14:10", "14:20", "14:30", "14:40", "14:50"],
      values: {
        "checkout-api": [1.0, 1.0, 1.1, 1.2, 1.5, 1.4],
        "payment-service": [1.0, 1.0, 1.1, 2.4, 6.4, 6.8],
        "retry-worker": [1.0, 1.0, 1.1, 1.9, 5.8, 6.1],
        "inventory-api": [1.0, 0.9, 1.0, 1.0, 0.9, 1.0],
        "shipping-api": [1.0, 1.0, 0.9, 1.0, 1.0, 0.9]
      },
      evidence: {
        query: heatmapQuery,
        rowCount: 30,
        timeWindow: { start: WINDOW_START, end: WINDOW_END },
        confidence: 0.91,
        taskId: "query-heatmap",
        durationMs: 42
      }
    },
    diff: {
      rows: diffRows,
      evidence: {
        query: diffQuery,
        rowCount: diffRows.length,
        timeWindow: { start: WINDOW_START, end: WINDOW_END },
        confidence: 0.95,
        taskId: "query-diff",
        durationMs: 63
      }
    },
    suspects: {
      suspects: [
        {
          service: "payment-service",
          rank: 1,
          confidence: 0.94,
          status: "confirmed",
          supportingSignals: ["deploy at 14:32", "8.3x span amplification", "heatmap outlier"],
          contradictingSignals: []
        },
        {
          service: "retry-worker",
          rank: 2,
          confidence: 0.68,
          status: "supporting",
          supportingSignals: ["slow retries after deploy"],
          contradictingSignals: ["no deploy on retry-worker"]
        },
        {
          service: "checkout-api",
          rank: 3,
          confidence: 0.24,
          status: "weakened",
          supportingSignals: ["upstream latency rose"],
          contradictingSignals: ["only 1.1x baseline"]
        },
        {
          service: "inventory-api",
          rank: 4,
          confidence: 0.09,
          status: "ruled_out",
          supportingSignals: [],
          contradictingSignals: ["flat latency", "no error-rate movement"]
        },
        {
          service: "shipping-api",
          rank: 5,
          confidence: 0.08,
          status: "ruled_out",
          supportingSignals: [],
          contradictingSignals: ["flat latency", "not in critical checkout path"]
        }
      ],
      reasoning: [
        {
          step: 1,
          action: "Find anomaly",
          finding: "Checkout p95 leaves the normal band immediately after 14:32.",
          confidence: 0.92
        },
        {
          step: 2,
          action: "Correlate deploys",
          finding: "payment-service v2.4.1 deployed at the same minute as the spike.",
          confidence: 0.94
        },
        {
          step: 3,
          action: "Rank services",
          finding: "payment-service is 8.3x baseline while peers stay near 1.0x.",
          confidence: 0.95
        },
        {
          step: 4,
          action: "Inspect diff",
          finding: "The deploy changed retry timeout from 3s to 15s, matching retry amplification.",
          confidence: 0.93
        }
      ],
      evidence: {
        query: diffQuery,
        rowCount: diffRows.length,
        timeWindow: { start: WINDOW_START, end: WINDOW_END },
        confidence: 0.94,
        taskId: "rank-suspects",
        durationMs: 124
      }
    },
    errorBudget: {
      consumedPct: 43,
      burnRate: 8.3,
      exhaustionEstimate: "about 4 hours",
      evidence: {
        query: errorBudgetQuery,
        rowCount: 1,
        timeWindow: { start: WINDOW_START, end: WINDOW_END },
        confidence: 0.88,
        taskId: "calculate-error-budget",
        durationMs: 28
      }
    },
    verdict: {
      rootCause: "payment-service retry timeout changed from 3s to 15s",
      confidence: 0.94,
      signals: ["14:32 deploy alignment", "8.3x span amplification", "payment heatmap outlier", "peer services ruled out"],
      recommendedAction:
        "Roll back payment-service v2.4.1 or restore the 3s retry timeout, then monitor payment spans and checkout p95.",
      evidence: {
        query: `${timelineQuery}\n\n${diffQuery}`,
        rowCount: timeline.length + diffRows.length,
        timeWindow: { start: WINDOW_START, end: WINDOW_END },
        confidence: 0.94,
        taskId: "generate-verdict",
        durationMs: 38
      }
    }
  };
}

export function smokeMetrics() {
  const board = buildIncidentBoard();
  const checkout = board.timeline.points.filter((p) => p.service === "checkout-api");
  const before = checkout.filter((p) => p.minute < "2026-07-22 14:32");
  const after = checkout.filter((p) => p.minute >= "2026-07-22 14:32");
  const beforeAvg = avg(before.map((p) => p.p95_ms));
  const afterAvg = avg(after.map((p) => p.p95_ms));
  const paymentDiff = board.diff.rows.find((row) => row.service === "payment-service");
  const peerIntensity = Math.max(
    ...(["inventory-api", "shipping-api"] as ServiceName[]).flatMap((service) => board.heatmap.values[service])
  );
  const paymentIntensity = Math.max(...board.heatmap.values["payment-service"]);

  return {
    beforeAvg,
    afterAvg,
    spikeRatio: afterAvg / beforeAvg,
    paymentDiff,
    peerIntensity,
    paymentIntensity,
    heatmapRatio: paymentIntensity / peerIntensity,
    topSuspect: board.suspects.suspects[0]?.service,
    errorBudget: board.errorBudget
  };
}

function latencyFor(service: ServiceName, index: number, afterDeploy: boolean) {
  const wave = Math.round(Math.sin(index / 5) * 5);
  if (!afterDeploy) return baselineFor(service) + wave;
  if (service === "checkout-api") return 392 + wave * 2;
  if (service === "payment-service") return 430 + wave * 3;
  if (service === "retry-worker") return 382 + wave * 3;
  if (service === "inventory-api") return 142 + wave;
  return 148 + wave;
}

function baselineFor(service: ServiceName) {
  switch (service) {
    case "checkout-api":
      return 151;
    case "payment-service":
      return 145;
    case "retry-worker":
      return 138;
    case "inventory-api":
      return 142;
    case "shipping-api":
      return 148;
  }
}

function avg(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
