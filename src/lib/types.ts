export type ServiceName =
  | "checkout-api"
  | "payment-service"
  | "retry-worker"
  | "inventory-api"
  | "shipping-api";

export type Evidence = {
  query: string;
  rowCount: number;
  timeWindow: { start: string; end: string };
  confidence: number;
  taskId?: string;
  durationMs?: number;
};

export type TimelinePoint = {
  minute: string;
  service: ServiceName;
  p95_ms: number;
  rolling_avg: number;
  upper_band: number;
  lower_band: number;
  is_anomaly: boolean;
};

export type DeployMarker = {
  service: ServiceName;
  version: string;
  deployedAt: string;
  diff: string;
};

export type HeatmapPart = {
  services: ServiceName[];
  times: string[];
  values: Record<ServiceName, number[]>;
  evidence: Evidence;
};

export type DiffRow = {
  service: ServiceName;
  before_ms: number;
  after_ms: number;
  amplification: number;
};

export type Suspect = {
  service: ServiceName;
  rank: number;
  confidence: number;
  status: "confirmed" | "supporting" | "weakened" | "ruled_out";
  supportingSignals: string[];
  contradictingSignals: string[];
};

export type ReasoningStep = {
  step: number;
  action: string;
  finding: string;
  confidence: number;
};

export type IncidentBoard = {
  timeline: { points: TimelinePoint[]; evidence: Evidence };
  deploy: DeployMarker;
  heatmap: HeatmapPart;
  diff: { rows: DiffRow[]; evidence: Evidence };
  suspects: { suspects: Suspect[]; reasoning: ReasoningStep[]; evidence: Evidence };
  errorBudget: { consumedPct: number; burnRate: number; exhaustionEstimate: string; evidence: Evidence };
  verdict: {
    rootCause: string;
    confidence: number;
    signals: string[];
    recommendedAction: string;
    evidence: Evidence;
  };
};
