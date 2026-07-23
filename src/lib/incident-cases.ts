import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { incidentCaseFromVerdict, isIncidentCase } from "./incident-case-model.ts";
import type { IncidentBoard, IncidentCase } from "./types.ts";

const storePath = join(process.cwd(), ".clickfuse-data", "incident-cases.json");

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
