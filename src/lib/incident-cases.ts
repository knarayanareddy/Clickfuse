import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { IncidentBoard, IncidentCase } from "./types.ts";

const storePath = join(process.cwd(), ".clickfuse-data", "incident-cases.json");

export function incidentCaseFromVerdict(board: IncidentBoard, now = new Date()): IncidentCase {
  const createdAt = now.toISOString();
  const topSuspect = board.suspects.suspects[0]?.service ?? board.deploy.service;
  const actionItems = [
    board.verdict.recommendedAction,
    `Page ${board.deploy.service} owner and attach evidence from ${board.verdict.evidence.taskId}.`,
    `Watch checkout p95 and payment-service spans until burn rate falls below 1x.`
  ];

  return {
    id: `INC-${createdAt.slice(0, 10).replaceAll("-", "")}-${createdAt.slice(11, 19).replaceAll(":", "")}`,
    title: `Checkout latency spike after ${board.deploy.service} ${board.deploy.version}`,
    status: "open",
    assignee: "on-call-sre",
    createdAt,
    updatedAt: createdAt,
    source: "verdict-promotion",
    rootCause: board.verdict.rootCause,
    confidence: board.verdict.confidence,
    recommendedAction: board.verdict.recommendedAction,
    actionItems,
    linkedAnalytics: {
      deployService: board.deploy.service,
      deployedAt: board.deploy.deployedAt,
      deployVersion: board.deploy.version,
      topSuspect,
      errorBudgetConsumedPct: board.errorBudget.consumedPct,
      burnRate: board.errorBudget.burnRate,
      evidenceTaskIds: [
        board.timeline.evidence.taskId,
        board.heatmap.evidence.taskId,
        board.diff.evidence.taskId,
        board.suspects.evidence.taskId,
        board.errorBudget.evidence.taskId,
        board.verdict.evidence.taskId
      ].filter((taskId): taskId is string => Boolean(taskId))
    }
  };
}

export async function listIncidentCases(): Promise<IncidentCase[]> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isIncidentCase) : [];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveIncidentCaseFromVerdict(board: IncidentBoard): Promise<IncidentCase> {
  const incident = incidentCaseFromVerdict(board);
  const existing = await listIncidentCases();
  const next = [incident, ...existing].slice(0, 20);
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return incident;
}

function isIncidentCase(value: unknown): value is IncidentCase {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "status" in value &&
      value.status === "open" &&
      "rootCause" in value &&
      typeof value.rootCause === "string" &&
      "linkedAnalytics" in value &&
      value.linkedAnalytics &&
      typeof value.linkedAnalytics === "object"
  );
}
